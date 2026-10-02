import { createStore, snapshot } from "./internal.js";

export type HistoryState<T> = { readonly past: readonly T[]; readonly present: T; readonly future: readonly T[]; readonly canUndo: boolean; readonly canRedo: boolean };
export type HistoryOptions<T> = { limit?: number; equals?: (a: T, b: T) => boolean };
export function createHistory<T>(initial: T, options: HistoryOptions<T> = {}) {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("History limit must be a positive integer");
  const equals = options.equals ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b));
  const state = (past: readonly T[], present: T, future: readonly T[]): HistoryState<T> => ({ past: Object.freeze([...past]), present, future: Object.freeze([...future]), canUndo: past.length > 0, canRedo: future.length > 0 });
  const store = createStore(state([], snapshot(initial), []));
  let group: string | undefined;
  return {
    getState: store.getState, subscribe: store.subscribe,
    set(value: T | ((current: T) => T), settings: { group?: string } = {}) {
      const current = store.getState();
      const next = snapshot(typeof value === "function" ? (value as (current: T) => T)(current.present) : value);
      if (equals(current.present, next)) return;
      const merge = settings.group !== undefined && settings.group === group;
      group = settings.group;
      store.set(state(merge ? current.past : [...current.past, current.present].slice(-limit), next, []));
    },
    undo() {
      const current = store.getState(); group = undefined;
      if (current.canUndo) store.set(state(current.past.slice(0, -1), current.past[current.past.length - 1], [current.present, ...current.future]));
    },
    redo() {
      const current = store.getState(); group = undefined;
      if (current.canRedo) store.set(state([...current.past, current.present].slice(-limit), current.future[0], current.future.slice(1)));
    },
    endGroup: () => { group = undefined; },
    reset(value: T) { group = undefined; store.set(state([], snapshot(value), [])); },
    clear() { group = undefined; store.set(state([], store.getState().present, [])); },
  };
}
