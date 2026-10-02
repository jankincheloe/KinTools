import { useSyncExternalStore } from "react";
import { createFilterBuilder, type FilterSchema } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useFilterBuilder<S extends FilterSchema<any>>(builder: ReturnType<typeof createFilterBuilder<S>>) {
  const state = useSyncExternalStore(builder.subscribe, builder.getState, builder.getState);
  return { state, builder };
}
