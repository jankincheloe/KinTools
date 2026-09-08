/** A codec maps the repeated values of one URL key to a typed value. */
export type QueryCodec<T> = {
  decode: (values: readonly string[]) => T | undefined;
  encode: (value: T) => readonly string[];
  /** Optional equality check used when deciding whether a value is its default. */
  equals?: (left: T, right: T) => boolean;
};

export type QueryField<T> = {
  codec: QueryCodec<T>;
  defaultValue: T | (() => T);
};

// `any` here is intentional: a schema is heterogeneous, while each field
// retains its own type through `QueryValues<S>`.
export type QuerySchema = Record<string, QueryField<any>>;

export type InferQueryField<F> = F extends QueryField<infer T> ? T : never;

export type QueryValues<S extends QuerySchema> = {
  [K in keyof S]: InferQueryField<S[K]>;
};

export type NavigationMode = "push" | "replace";

export type QueryStateAdapter = {
  getSearch: () => string;
  setSearch: (search: string, mode: NavigationMode) => void;
  subscribe?: (listener: () => void) => () => void;
};

export type QueryStateOptions = {
  adapter?: QueryStateAdapter;
  /** Search string used when no adapter is supplied, or as an SSR snapshot. */
  initialSearch?: string;
  mode?: NavigationMode;
};

export type UpdateOptions = { mode?: NavigationMode };

export type QueryState<S extends QuerySchema> = {
  get: () => QueryValues<S>;
  getSearch: () => string;
  /** Updates only the supplied fields and retains unknown URL parameters. */
  set: (
    patch: Partial<QueryValues<S>> | ((current: QueryValues<S>) => Partial<QueryValues<S>>),
    options?: UpdateOptions,
  ) => void;
  /** Replaces every known field; unknown URL parameters are still retained. */
  replace: (values: QueryValues<S>, options?: UpdateOptions) => void;
  /** Resets all fields, or only the selected fields, to their defaults. */
  reset: (keys?: readonly (keyof S)[], options?: UpdateOptions) => void;
  subscribe: (listener: () => void) => () => void;
};

function defaultFor<T>(field: QueryField<T>): T {
  return typeof field.defaultValue === "function"
    ? (field.defaultValue as () => T)()
    : field.defaultValue;
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeSearch(search: string): string {
  const trimmed = search.trim();
  return trimmed === "" ? "" : trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
}

function parseParams(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(normalizeSearch(search));
}

function sameValue<T>(codec: QueryCodec<T>, left: T, right: T): boolean {
  if (codec.equals) return codec.equals(left, right);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  }
  return Object.is(left, right);
}

/** Turns a declarative schema and a search string into fully defaulted typed values. */
export function parseQuery<S extends QuerySchema>(schema: S, search: string | URLSearchParams): QueryValues<S> {
  const params = parseParams(search);
  const result = {} as QueryValues<S>;
  for (const key of Object.keys(schema) as Array<keyof S & string>) {
    const field = schema[key] as QueryField<unknown>;
    const values = params.getAll(key);
    let value: unknown;
    if (values.length > 0) {
      try {
        value = field.codec.decode(values);
      } catch {
        value = undefined;
      }
    }
    (result as Record<string, unknown>)[key] = value === undefined ? defaultFor(field) : value;
  }
  return result;
}

/**
 * Serializes typed values while retaining query keys not present in the schema.
 * Known fields equal to their defaults are deliberately omitted.
 */
export function serializeQuery<S extends QuerySchema>(
  schema: S,
  values: QueryValues<S>,
  search: string | URLSearchParams = "",
): string {
  const params = parseParams(search);
  for (const key of Object.keys(schema)) params.delete(key);

  for (const key of Object.keys(schema) as Array<keyof S & string>) {
    const field = schema[key] as QueryField<unknown>;
    const value = (values as Record<string, unknown>)[key];
    const fallback = defaultFor(field);
    if (sameValue(field.codec, value, fallback)) continue;
    let encoded: readonly string[];
    try {
      encoded = field.codec.encode(value);
    } catch {
      encoded = [];
    }
    for (const item of encoded) {
      if (typeof item === "string") params.append(key, item);
    }
  }
  const output = params.toString();
  return output === "" ? "" : `?${output}`;
}

export function defineQueryField<T>(codec: QueryCodec<T>, defaultValue: T | (() => T)): QueryField<T> {
  return { codec, defaultValue };
}

const scalar = <T>(decode: (value: string) => T | undefined, encode: (value: T) => string): QueryCodec<T> => ({
  decode: (values) => (values.length === 1 ? decode(values[0]) : undefined),
  encode: (value) => [encode(value)],
});

export const stringCodec: QueryCodec<string> = scalar(
  (value) => value,
  (value) => value,
);

export const numberCodec: QueryCodec<number> = scalar(
  (value) => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
  (value) => String(value),
);

export const booleanCodec: QueryCodec<boolean> = scalar(
  (value) => (value === "true" ? true : value === "false" ? false : undefined),
  (value) => (value ? "true" : "false"),
);

export const stringArrayCodec: QueryCodec<string[]> = {
  decode: (values) => [...values],
  encode: (value) => value,
  equals: (left, right) => left.length === right.length && left.every((item, index) => item === right[index]),
};

/** Creates a schema field with concise declaration syntax. */
export const field = defineQueryField;

export function createQueryState<S extends QuerySchema>(schema: S, options: QueryStateOptions = {}): QueryState<S> {
  let localSearch = options.initialSearch ?? "";
  const adapter = options.adapter;
  const listeners = new Set<() => void>();
  let removeAdapterListener: (() => void) | undefined;
  let cachedSearch: string | undefined;
  let cachedValues: QueryValues<S> | undefined;

  const getSearch = () => (adapter ? adapter.getSearch() : localSearch);
  // useSyncExternalStore compares snapshots with Object.is. Cache by the
  // adapter's search string so a stable URL produces a stable object too.
  const getSnapshot = (): QueryValues<S> => {
    const search = getSearch();
    if (cachedValues === undefined || cachedSearch !== search) {
      cachedSearch = search;
      cachedValues = parseQuery(schema, search);
    }
    return cachedValues;
  };
  const emit = () => listeners.forEach((listener) => listener());
  const connect = () => {
    if (listeners.size === 1 && adapter?.subscribe) removeAdapterListener = adapter.subscribe(emit);
  };
  const disconnect = () => {
    if (listeners.size === 0) {
      removeAdapterListener?.();
      removeAdapterListener = undefined;
    }
  };
  const commit = (values: QueryValues<S>, mode = options.mode ?? "replace") => {
    const nextSearch = serializeQuery(schema, values, getSearch());
    if (nextSearch === getSearch()) return;
    if (adapter) adapter.setSearch(nextSearch, mode);
    else localSearch = nextSearch;
    emit();
  };

  const state: QueryState<S> = {
    get: getSnapshot,
    getSearch,
    set: (patch, updateOptions) => {
      const current = getSnapshot();
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      commit({ ...current, ...nextPatch }, updateOptions?.mode);
    },
    replace: (values, updateOptions) => commit(values, updateOptions?.mode),
    reset: (keys, updateOptions) => {
      // Never mutate the cached snapshot: React may still hold this object as
      // the last committed useSyncExternalStore value.
      const current = { ...getSnapshot() };
      const resetKeys = keys ? new Set<PropertyKey>(keys) : new Set(Object.keys(schema));
      for (const key of resetKeys) {
        if (hasOwn(schema, key)) {
          const field = schema[key as keyof S] as QueryField<unknown>;
          (current as Record<string, unknown>)[key as string] = defaultFor(field);
        }
      }
      commit(current, updateOptions?.mode);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      connect();
      return () => {
        listeners.delete(listener);
        disconnect();
      };
    },
  };
  return state;
}
