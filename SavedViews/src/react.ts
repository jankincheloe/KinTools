import { useSyncExternalStore } from "react";
import { createSavedViews } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useSavedViews<T>(views: ReturnType<typeof createSavedViews<T>>) {
  const state = useSyncExternalStore(views.subscribe, views.getState, views.getState);
  return { state, views };
}
