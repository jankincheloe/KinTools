import { useSyncExternalStore } from "react";
import { createDraftHandler } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useDraftHandler<T>(draft: ReturnType<typeof createDraftHandler<T>>) {
  const state = useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);
  return { state, draft };
}
