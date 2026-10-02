import { useSyncExternalStore } from "react";
import { createCommandRegistry, type CommandMap } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useCommandRegistry<C, D extends CommandMap<C>>(registry: ReturnType<typeof createCommandRegistry<C, D>>) {
  const state = useSyncExternalStore(registry.subscribe, registry.getState, registry.getState);
  return { state, registry };
}
