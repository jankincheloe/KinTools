import { createFilterBuilder, filterItems, type FilterSchema } from "../src/core.js";
import { useFilterBuilder } from "../src/react.js";
type Person = { name: string; age: number; status: "open" | "closed" };
const schema = {
  name: { type: "text", getValue: (p: Person) => p.name },
  age: { type: "number", getValue: (p: Person) => p.age },
  status: { type: "enum", options: ["open", "closed"] as const, getValue: (p: Person) => p.status },
} satisfies FilterSchema<Person>;
const builder = createFilterBuilder(schema);
builder.set({ field: "age", operator: "between", value: [18, 40] });
const people: Person[] = builder.filter([]);
filterItems(people, schema, { field: "name", operator: "contains", value: "Ada" });
useFilterBuilder(builder).builder.set({ field: "status", operator: "in", value: ["open"] });
// @ts-expect-error text operators are invalid for numeric fields
builder.set({ field: "age", operator: "contains", value: "18" });
// @ts-expect-error enum values are restricted to the declared options
builder.set({ field: "status", operator: "eq", value: "missing" });
// @ts-expect-error unknown fields are rejected
builder.set({ field: "unknown", operator: "eq", value: "x" });
