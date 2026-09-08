import { useMemo, useSyncExternalStore } from "react";

import {
  createQueryState,
  type QuerySchema,
  type QueryState,
  type QueryStateOptions,
  type QueryValues,
} from "./core.js";
import { createBrowserQueryState, type QueryStateWindow } from "./browser.js";

export type UseQueryStateOptions = QueryStateOptions & { schemaKey?: string; window?: QueryStateWindow };

export type UseQueryStateResult<S extends QuerySchema> = {
  values: QueryValues<S>;
  set: QueryState<S>["set"];
  replace: QueryState<S>["replace"];
  reset: QueryState<S>["reset"];
  state: QueryState<S>;
};

/** React adapter using useSyncExternalStore, including a stable SSR snapshot. */
export function createReactQueryState<S extends QuerySchema>(
  schema: S,
  options: UseQueryStateOptions = {},
): QueryState<S> {
  if (options.adapter) return createQueryState(schema, options);
  return createBrowserQueryState(schema, {
    window: options.window,
    initialSearch: options.initialSearch,
    mode: options.mode,
  });
}

export function useQueryState<S extends QuerySchema>(
  schema: S,
  options: UseQueryStateOptions = {},
): UseQueryStateResult<S> {
  const state = useMemo(
    () => createReactQueryState(schema, options),
    [schema, options.adapter, options.initialSearch, options.mode, options.schemaKey, options.window],
  );
  const values = useSyncExternalStore(state.subscribe, state.get, state.get);
  return { values, set: state.set, replace: state.replace, reset: state.reset, state };
}
