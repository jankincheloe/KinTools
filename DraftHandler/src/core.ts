import { createStore, snapshot } from "./internal.js";

export type DraftPersistence<T> = {
  save: (value: T, signal: AbortSignal) => void | Promise<void>;
  load?: (signal: AbortSignal) => unknown | Promise<unknown>;
};
export type DraftScheduler = { set: (callback: () => void, delay: number) => unknown; clear: (handle: unknown) => void };
export type DraftOptions<T> = {
  initialValue: T; validate: (value: unknown) => value is T; persistence: DraftPersistence<T>;
  debounceMs?: number; scheduler?: DraftScheduler; now?: () => number;
};
export type DraftState<T> = {
  readonly value: T; readonly dirty: boolean;
  readonly status: "idle" | "scheduled" | "saving" | "restoring" | "saved" | "error" | "disposed";
  readonly error?: unknown; readonly savedAt?: number;
};
export function createDraftHandler<T>(options: DraftOptions<T>) {
  const delay = options.debounceMs ?? 500;
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Invalid debounce duration");
  const scheduler: DraftScheduler = options.scheduler ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const owned = (value: unknown): T => { if (!options.validate(value)) throw new TypeError("Invalid draft value"); return snapshot(value); };
  const store = createStore<DraftState<T>>({ value: owned(options.initialValue), dirty: false, status: "idle" });
  let revision = 0;
  let savedRevision = 0;
  let timer: unknown;
  let scheduled = false;
  let disposed = false;
  let saving: Promise<boolean> | undefined;
  let saveController: AbortController | undefined;
  let loadController: AbortController | undefined;
  const assertLive = () => { if (disposed) throw new Error("DraftHandler is disposed"); };
  const cancelTimer = () => { if (scheduled) scheduler.clear(timer); scheduled = false; };
  const flush = (): Promise<boolean> => {
    assertLive(); cancelTimer();
    if (saving) return saving;
    if (savedRevision === revision) return Promise.resolve(true);
    // Defer execution until the shared promise is assigned, including synchronous adapters.
    saving = Promise.resolve().then(async () => {
      while (!disposed && savedRevision !== revision) {
        const currentRevision = revision;
        const value = store.getState().value;
        saveController = new AbortController();
        store.set({ ...store.getState(), status: "saving", error: undefined });
        try { await options.persistence.save(value, saveController.signal); }
        catch (error) {
          if (disposed) return false;
          // A newer edit should still be saved even if the superseded save failed.
          if (currentRevision !== revision) continue;
          store.set({ ...store.getState(), status: "error", error, dirty: true });
          return false;
        }
        if (disposed) return false;
        savedRevision = currentRevision;
        if (savedRevision === revision) store.set({ value: store.getState().value, dirty: false, status: "saved", savedAt: (options.now ?? Date.now)() });
      }
      return !disposed;
    }).finally(() => { saving = undefined; saveController = undefined; });
    return saving;
  };
  return {
    getState: store.getState, subscribe: store.subscribe, flush,
    set(value: T) {
      assertLive(); const next = owned(value); revision++; cancelTimer(); loadController?.abort();
      store.set({ value: next, dirty: true, status: saving ? "saving" : "scheduled", savedAt: store.getState().savedAt });
      scheduled = true;
      timer = scheduler.set(() => { scheduled = false; if (!disposed) void flush(); }, delay);
    },
    async restore() {
      assertLive();
      if (!options.persistence.load || store.getState().dirty || saving) return false;
      const currentRevision = revision;
      loadController?.abort(); const controller = new AbortController(); loadController = controller;
      store.set({ ...store.getState(), status: "restoring", error: undefined });
      try {
        const value = await options.persistence.load(controller.signal);
        if (disposed || controller.signal.aborted || currentRevision !== revision) return false;
        if (value === null || value === undefined) { store.set({ ...store.getState(), status: "idle" }); return false; }
        store.set({ value: owned(value), dirty: false, status: "saved" });
        return true;
      } catch (error) {
        if (!disposed && !controller.signal.aborted && currentRevision === revision) store.set({ ...store.getState(), status: "error", error });
        return false;
      } finally { if (loadController === controller) loadController = undefined; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelTimer(); saveController?.abort(); loadController?.abort();
      store.set({ ...store.getState(), status: "disposed" });
    },
  };
}
