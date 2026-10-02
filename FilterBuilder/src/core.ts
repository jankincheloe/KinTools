import { createStore, snapshot } from "./internal.js";

export type FilterField<T> = { getValue: (item: T) => unknown } & (
  | { type: "text"; caseSensitive?: boolean }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "enum"; options: readonly string[] }
);
export type FilterSchema<T> = Readonly<Record<string, FilterField<T>>>;
type Clause<K, F> = { field: K } & (
  | { operator: "empty" | "notEmpty" }
  | (F extends { type: "text" } ? { operator: "eq" | "ne" | "contains" | "startsWith"; value: string }
    : F extends { type: "number" } ? { operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; value: number } | { operator: "between"; value: readonly [number, number] }
    : F extends { type: "boolean" } ? { operator: "eq" | "ne"; value: boolean }
    : F extends { type: "enum"; options: readonly (infer V)[] } ? { operator: "eq" | "ne"; value: V } | { operator: "in" | "notIn"; value: readonly V[] }
    : never)
);
export type FilterNode<S extends FilterSchema<any>> =
  | { [K in keyof S]: Clause<K, S[K]> }[keyof S]
  | { operator: "and" | "or"; children: readonly FilterNode<S>[] };

/** Validates persisted/API input against known fields and their operators. */
export function validateFilter<S extends FilterSchema<any>>(schema: S, input: unknown): FilterNode<S> {
  let remaining = 1000;
  const visit = (value: unknown, depth: number): void => {
    if (--remaining < 0 || depth > 32) throw new TypeError("Filter is too complex");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid filter node");
    const node = value as Record<string, unknown>;
    if (node.operator === "and" || node.operator === "or") {
      if (!Array.isArray(node.children)) throw new TypeError("Group children must be an array");
      for (const child of node.children) visit(child, depth + 1);
      return;
    }
    if (typeof node.field !== "string" || !Object.hasOwn(schema, node.field)) throw new TypeError("Unknown filter field");
    const field = schema[node.field];
    if (node.operator === "empty" || node.operator === "notEmpty") return;
    const operators = { text: ["eq", "ne", "contains", "startsWith"], number: ["eq", "ne", "lt", "lte", "gt", "gte", "between"], boolean: ["eq", "ne"], enum: ["eq", "ne", "in", "notIn"] };
    if (!operators[field.type].includes(String(node.operator))) throw new TypeError("Invalid operator for field");
    const finite = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry);
    const valid = field.type === "text" ? typeof node.value === "string"
      : field.type === "boolean" ? typeof node.value === "boolean"
      : field.type === "number" ? node.operator === "between"
        ? Array.isArray(node.value) && node.value.length === 2 && node.value.every(finite) && node.value[0] <= node.value[1]
        : finite(node.value)
      : node.operator === "in" || node.operator === "notIn"
        ? Array.isArray(node.value) && node.value.every((v) => typeof v === "string" && field.options.includes(v))
        : typeof node.value === "string" && field.options.includes(node.value);
    if (!valid) throw new TypeError("Invalid filter value");
  };
  visit(input, 0);
  return snapshot(input) as FilterNode<S>;
}

function evaluate<T>(schema: FilterSchema<T>, node: FilterNode<FilterSchema<T>>, item: T): boolean {
  if ("children" in node) return node.operator === "and"
    ? node.children.every((child) => evaluate(schema, child, item))
    : node.children.some((child) => evaluate(schema, child, item));
  const field = schema[node.field];
  let actual = field.getValue(item);
  const empty = actual === null || actual === undefined || actual === "";
  if (node.operator === "empty") return empty;
  if (node.operator === "notEmpty") return !empty;
  if (empty || !('value' in node)) return false;
  let expected: unknown = node.value;
  if (field.type === "text") {
    if (typeof actual !== "string") return false;
    if (!field.caseSensitive) { actual = actual.toLowerCase(); expected = (expected as string).toLowerCase(); }
  } else if (field.type === "number" && (typeof actual !== "number" || !Number.isFinite(actual))) return false;
  else if (field.type === "boolean" && typeof actual !== "boolean") return false;
  else if (field.type === "enum" && (typeof actual !== "string" || !field.options.includes(actual))) return false;
  switch (node.operator) {
    case "eq": return actual === expected;
    case "ne": return actual !== expected;
    case "contains": return (actual as string).includes(expected as string);
    case "startsWith": return (actual as string).startsWith(expected as string);
    case "lt": return (actual as number) < (expected as number);
    case "lte": return (actual as number) <= (expected as number);
    case "gt": return (actual as number) > (expected as number);
    case "gte": return (actual as number) >= (expected as number);
    case "between": return (actual as number) >= (expected as number[])[0] && (actual as number) <= (expected as number[])[1];
    case "in": return (expected as unknown[]).includes(actual);
    case "notIn": return !(expected as unknown[]).includes(actual);
  }
}

export function filterItems<T, S extends FilterSchema<T>>(items: readonly T[], schema: S, input: FilterNode<S>): T[] {
  const node = validateFilter(schema, input);
  return items.filter((item) => evaluate(schema, node as FilterNode<FilterSchema<T>>, item));
}
export function serializeFilter<S extends FilterSchema<any>>(schema: S, node: FilterNode<S>): string {
  return JSON.stringify(validateFilter(schema, node));
}
export function parseFilter<S extends FilterSchema<any>>(schema: S, source: string): FilterNode<S> {
  return validateFilter(schema, JSON.parse(source));
}
export function createFilterBuilder<S extends FilterSchema<any>>(schema: S, initial?: FilterNode<S>) {
  const empty: FilterNode<S> = snapshot({ operator: "and", children: [] });
  const store = createStore({ filter: validateFilter(schema, initial ?? empty) });
  return {
    getState: store.getState, subscribe: store.subscribe,
    set: (filter: FilterNode<S>) => store.set({ filter: validateFilter(schema, filter) }),
    reset: () => store.set({ filter: empty }),
    serialize: () => serializeFilter(schema, store.getState().filter),
    filter: (items: readonly Parameters<S[keyof S]["getValue"]>[0][]) => filterItems(items, schema, store.getState().filter),
  };
}
