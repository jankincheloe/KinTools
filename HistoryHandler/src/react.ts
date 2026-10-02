import { useSyncExternalStore } from "react";
import { createHistory } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useHistory<T>(history: ReturnType<typeof createHistory<T>>) {
  const state = useSyncExternalStore(history.subscribe, history.getState, history.getState);
  return { state, history };
}
