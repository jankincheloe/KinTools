import { useSyncExternalStore } from "react";
import { createTaskQueue } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useTaskQueue<R>(queue: ReturnType<typeof createTaskQueue<R>>) {
  const state = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);
  return { state, queue };
}
