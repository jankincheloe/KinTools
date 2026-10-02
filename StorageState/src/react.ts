import { useSyncExternalStore } from "react";
import { createStorageState } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useStorageState<T>(storage: ReturnType<typeof createStorageState<T>>) {
  const state = useSyncExternalStore(storage.subscribe, storage.getState, storage.getState);
  return { state, storage };
}
