import type { ListColumnState } from "./core.js";

export type ListStateStorage = {
  read: (key: string) => ListColumnState | null;
  write: (key: string, state: ListColumnState) => void;
  remove: (key: string) => void;
};

/** Default client-side storage. Consumers can replace it with an API-backed adapter. */
export const browserListStateStorage: ListStateStorage = {
  read(key) {
    if (typeof window === "undefined") return null;
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const candidate = value as Partial<ListColumnState>;
      return {
        hiddenColumnIds: Array.isArray(candidate.hiddenColumnIds)
          ? candidate.hiddenColumnIds.filter((id): id is string => typeof id === "string")
          : [],
        widths:
          candidate.widths && typeof candidate.widths === "object" && !Array.isArray(candidate.widths)
            ? Object.fromEntries(
                Object.entries(candidate.widths).filter(
                  (entry): entry is [string, number] =>
                    typeof entry[0] === "string" && typeof entry[1] === "number",
                ),
              )
            : {},
      };
    } catch {
      return null;
    }
  },
  write(key, state) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage is a convenience only; rendering remains available without it.
    }
  },
  remove(key) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  },
};
