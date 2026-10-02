import { createMemoryStorage, type StorageAdapter } from "./core.js";

export type StorageWindow = Pick<Window, "localStorage" | "sessionStorage" | "addEventListener" | "removeEventListener">;
/** SSR uses memory; unavailable browser storage is reported by StorageState. */
export function createBrowserStorage(options: { kind?: "local" | "session"; window?: StorageWindow } = {}): StorageAdapter {
  const target = options.window ?? (typeof window === "undefined" ? undefined : window);
  if (!target) return createMemoryStorage();
  const getStorage = () => options.kind === "session" ? target.sessionStorage : target.localStorage;
  const listeners = new Set<(key: string | null) => void>();
  const emit = (key: string | null) => { for (const listener of [...listeners]) listener(key); };
  const handle = (event: StorageEvent) => { if (event.storageArea === getStorage()) emit(event.key); };
  return {
    read: (key) => getStorage().getItem(key),
    write: (key, value) => { getStorage().setItem(key, value); emit(key); },
    remove: (key) => { getStorage().removeItem(key); emit(key); },
    subscribe(listener) {
      if (listeners.size === 0) target.addEventListener("storage", handle as EventListener);
      listeners.add(listener);
      return () => { listeners.delete(listener); if (listeners.size === 0) target.removeEventListener("storage", handle as EventListener); };
    },
  };
}
