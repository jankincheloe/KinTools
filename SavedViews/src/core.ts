import { createStore, snapshot } from "./internal.js";

export type SavedView<T> = { readonly id: string; readonly name: string; readonly value: T; readonly version: number; readonly updatedAt: number };
export type ViewStorage = { read: () => string | null; write: (source: string) => void };
export type SavedViewsOptions<T> = {
  validate: (value: unknown) => value is T; storage?: ViewStorage; version?: number;
  migrate?: (value: unknown, fromVersion: number) => unknown;
  now?: () => number; createId?: () => string;
};
export type SavedViewsState<T> = { readonly views: readonly SavedView<T>[]; readonly error?: unknown };
export function createSavedViews<T>(options: SavedViewsOptions<T>) {
  const version = options.version ?? 1;
  if (!Number.isInteger(version) || version < 1) throw new RangeError("Invalid view version");
  const now = options.now ?? Date.now;
  let sequence = 0;
  const createId = options.createId ?? (() => globalThis.crypto?.randomUUID?.() ?? `view-${now()}-${++sequence}`);
  let memory: string | null = null;
  const storage = options.storage ?? { read: () => memory, write: (source: string) => { memory = source; } };
  const store = createStore<SavedViewsState<T>>({ views: Object.freeze([]) });
  const name = (input: string) => { if (typeof input !== "string" || !input.trim()) throw new TypeError("A view name is required"); return input.trim(); };
  const owned = (value: unknown): T => { if (!options.validate(value)) throw new TypeError("Invalid view value"); return snapshot(value); };
  const decode = (source: string | null): readonly SavedView<T>[] => {
    if (source === null) return Object.freeze([]);
    const envelope = JSON.parse(source);
    if (envelope?.schemaVersion !== 1 || !Array.isArray(envelope.views)) throw new TypeError("Invalid views envelope");
    const ids = new Set<string>();
    return Object.freeze(envelope.views.map((entry: Record<string, unknown>) => {
      if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !Number.isInteger(entry.version) || (entry.version as number) < 1 || (entry.version as number) > version || typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) throw new TypeError("Invalid saved view");
      ids.add(entry.id);
      let value = entry.value;
      if (entry.version !== version) {
        if (!options.migrate) throw new TypeError("Missing view migration");
        value = options.migrate(value, entry.version as number);
      }
      return Object.freeze({ id: entry.id, name: name(entry.name as string), version, updatedAt: entry.updatedAt, value: owned(value) });
    }));
  };
  const reload = () => {
    try { store.set({ views: decode(storage.read()) }); return true; }
    catch (error) { store.set({ views: store.getState().views, error }); return false; }
  };
  const commit = (views: readonly SavedView<T>[]) => {
    try {
      storage.write(JSON.stringify({ schemaVersion: 1, views }));
      store.set({ views: Object.freeze([...views]) });
    } catch (error) { store.set({ views: store.getState().views, error }); throw error; }
  };
  if (options.storage) reload();
  const get = (id: string) => store.getState().views.find((view) => view.id === id);
  return {
    getState: store.getState, subscribe: store.subscribe, reload, get,
    save(input: { id?: string; name: string; value: T }) {
      const id = input.id ?? createId();
      if (typeof id !== "string" || !id) throw new TypeError("Invalid view ID");
      if (input.id === undefined && get(id)) throw new TypeError("Duplicate generated view ID");
      const updatedAt = now();
      if (!Number.isFinite(updatedAt)) throw new TypeError("Invalid timestamp");
      const view = Object.freeze({ id, name: name(input.name), value: owned(input.value), version, updatedAt });
      const entries = store.getState().views;
      commit(get(id) ? entries.map((entry) => entry.id === id ? view : entry) : [...entries, view]);
      return view;
    },
    rename(id: string, nextName: string) {
      const view = get(id); if (!view) throw new Error("Unknown view");
      const renamed = Object.freeze({ ...view, name: name(nextName), updatedAt: now() });
      commit(store.getState().views.map((entry) => entry.id === id ? renamed : entry));
      return renamed;
    },
    remove(id: string) { if (!get(id)) return false; commit(store.getState().views.filter((view) => view.id !== id)); return true; },
    apply(id: string, apply: (value: T) => void) { const view = get(id); if (!view) throw new Error("Unknown view"); apply(view.value); },
    export: () => JSON.stringify({ schemaVersion: 1, views: store.getState().views }),
    import: (source: string) => commit(decode(source)),
  };
}
