import { createStore, snapshot } from "./internal.js";

export type StorageAdapter = {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  remove: (key: string) => void;
  subscribe?: (listener: (key: string | null) => void) => () => void;
};
export type StorageStateOptions<T> = {
  key: string; initialValue: T; version?: number; adapter?: StorageAdapter;
  validate: (input: unknown) => input is T;
  /** Keyed by the destination version, applied one version at a time. */
  migrations?: Readonly<Record<number, (input: unknown) => unknown>>;
};
export type StorageSnapshot<T> = { readonly value: T; readonly status: "ready" | "error"; readonly error?: unknown };
export function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const values = new Map(Object.entries(initial));
  const listeners = new Set<(key: string | null) => void>();
  const emit = (key: string) => { for (const listener of [...listeners]) listener(key); };
  return { read: (key) => values.get(key) ?? null, write: (key, value) => { values.set(key, value); emit(key); }, remove: (key) => { values.delete(key); emit(key); }, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
export function createStorageState<T>(options: StorageStateOptions<T>) {
  const version = options.version ?? 1;
  if (!options.key || !Number.isInteger(version) || version < 1) throw new TypeError("A key and positive storage version are required");
  if (!options.validate(options.initialValue)) throw new TypeError("Invalid initial storage value");
  const initial = snapshot(options.initialValue);
  const adapter = options.adapter ?? createMemoryStorage();
  const store = createStore<StorageSnapshot<T>>({ value: initial, status: "ready" });
  let disposed = false;
  let writing = false;
  const assertLive = () => { if (disposed) throw new Error("StorageState is disposed"); };
  const decode = (raw: string | null): T => {
    if (raw === null) return initial;
    const envelope: unknown = JSON.parse(raw);
    if (!envelope || typeof envelope !== "object" || !('version' in envelope) || !('value' in envelope)) throw new TypeError("Invalid storage envelope");
    let oldVersion = (envelope as { version: number }).version;
    let value: unknown = envelope.value;
    if (!Number.isInteger(oldVersion) || oldVersion < 1 || oldVersion > version) throw new TypeError("Unsupported storage version");
    while (oldVersion < version) {
      const migrate = options.migrations?.[++oldVersion];
      if (!migrate) throw new TypeError("Missing storage migration");
      value = migrate(value);
    }
    if (!options.validate(value)) throw new TypeError("Invalid stored value");
    return snapshot(value);
  };
  const reload = () => {
    assertLive();
    try { store.set({ value: decode(adapter.read(options.key)), status: "ready" }); return true; }
    catch (error) { store.set({ value: store.getState().value, status: "error", error }); return false; }
  };
  reload();
  const unsubscribe = adapter.subscribe?.((key) => { if (!disposed && !writing && (key === options.key || key === null)) reload(); });
  return {
    getState: store.getState, subscribe: store.subscribe, reload,
    set(value: T | ((current: T) => T)) {
      assertLive();
      const next = typeof value === "function" ? (value as (current: T) => T)(store.getState().value) : value;
      if (!options.validate(next)) throw new TypeError("Invalid storage value");
      const owned = snapshot(next);
      writing = true;
      try { adapter.write(options.key, JSON.stringify({ version, value: owned })); store.set({ value: owned, status: "ready" }); return true; }
      catch (error) { store.set({ value: store.getState().value, status: "error", error }); return false; }
      finally { writing = false; }
    },
    reset() {
      assertLive(); writing = true;
      try { adapter.remove(options.key); store.set({ value: initial, status: "ready" }); return true; }
      catch (error) { store.set({ value: store.getState().value, status: "error", error }); return false; }
      finally { writing = false; }
    },
    dispose() { disposed = true; unsubscribe?.(); },
  };
}
