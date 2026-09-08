import { createQueryState, type QuerySchema, type QueryState, type QueryStateOptions } from "./core.js";

export type QueryStateWindow = {
  location: { href: string; search: string };
  history: {
    pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
    replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  };
  addEventListener: (type: "popstate", listener: () => void) => void;
  removeEventListener: (type: "popstate", listener: () => void) => void;
};

export type BrowserQueryStateOptions = Omit<QueryStateOptions, "adapter"> & {
  window?: QueryStateWindow;
};

/** Creates a history-backed store without touching window during SSR. */
export function createBrowserQueryState<S extends QuerySchema>(
  schema: S,
  options: BrowserQueryStateOptions = {},
): QueryState<S> {
  const browserWindow = options.window ?? (typeof window !== "undefined" ? (window as unknown as QueryStateWindow) : undefined);
  if (!browserWindow) return createQueryState(schema, { initialSearch: options.initialSearch, mode: options.mode });

  const adapter = {
    getSearch: () => browserWindow.location.search,
    setSearch: (search: string, mode: "push" | "replace") => {
      const url = new URL(browserWindow.location.href);
      url.search = search;
      browserWindow.history[mode === "push" ? "pushState" : "replaceState"](null, "", url.href);
    },
    subscribe: (listener: () => void) => {
      browserWindow.addEventListener("popstate", listener);
      return () => browserWindow.removeEventListener("popstate", listener);
    },
  };
  return createQueryState(schema, { ...options, adapter });
}
