import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  createOverlayManager,
  type OverlayDefinitions,
  type OverlayEntry,
  type OverlayManager,
  type OverlayOpenOptions,
  type OverlayRequest,
} from "./core.js";
import { acquireScrollLock, focusFirst, handleEscape, trapFocus } from "./dom.js";

type OverlayContextValue = OverlayManager<OverlayDefinitions>;
const OverlayContext = createContext<OverlayContextValue | null>(null);
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type OverlayRenderHelpers = Readonly<{
  close: () => boolean;
  closeTop: () => string | undefined;
}>;

export type OverlayRenderer<D extends OverlayDefinitions> = (
  entry: OverlayEntry<D>,
  helpers: OverlayRenderHelpers,
) => ReactNode;

export type OverlayPortalHostProps<D extends OverlayDefinitions> = Readonly<{
  manager: OverlayManager<D>;
  render: OverlayRenderer<D>;
}>;

function useOverlaySnapshot<D extends OverlayDefinitions>(manager: OverlayManager<D>) {
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

/**
 * Renders the current stack into a neutral portal host and owns DOM lifecycle
 * concerns. The host intentionally supplies no role, text, color, or styling.
 */
export function OverlayPortalHost<D extends OverlayDefinitions>({ manager, render }: OverlayPortalHostProps<D>): ReactNode {
  const snapshot = useOverlaySnapshot(manager);
  const previousIds = useRef<Set<string>>(new Set());
  const newlyOpened = useRef<Set<string>>(new Set());
  const focusReturn = useRef(new Map<string, HTMLElement>());
  const entryRefs = useRef(new Map<string, HTMLDivElement>());
  const lockReleases = useRef(new Map<string, () => void>());

  useIsomorphicLayoutEffect(() => {
    const documentObject = typeof document === "undefined" ? undefined : document;
    if (!documentObject) return;
    const nextIds = new Set(snapshot.overlays.map((entry) => entry.id));
    const removed = [...previousIds.current].filter((id) => !nextIds.has(id));
    for (const id of removed) {
      const target = focusReturn.current.get(id);
      focusReturn.current.delete(id);
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
    const added = new Set<string>();
    for (const entry of snapshot.overlays) {
      if (!previousIds.current.has(entry.id)) {
        added.add(entry.id);
        const active = documentObject.activeElement;
        if (active instanceof HTMLElement) focusReturn.current.set(entry.id, active);
      }
    }
    newlyOpened.current = added;
    previousIds.current = nextIds;
  }, [snapshot]);

  useIsomorphicLayoutEffect(() => {
    const modal = manager.getTopModal();
    if (!modal) return;
    const container = entryRefs.current.get(modal.id);
    if (container && newlyOpened.current.has(modal.id)) {
      newlyOpened.current.delete(modal.id);
      focusFirst(container);
    }
  }, [manager, snapshot]);

  useEffect(() => {
    const documentObject = typeof document === "undefined" ? undefined : document;
    if (!documentObject) return;
    const onKeyDown = (event: KeyboardEvent) => {
      handleEscape(event, manager.closeTop);
      const modal = manager.getTopModal();
      if (!modal) return;
      const container = entryRefs.current.get(modal.id);
      if (container) trapFocus(event, container);
    };
    documentObject.addEventListener("keydown", onKeyDown, true);
    return () => documentObject.removeEventListener("keydown", onKeyDown, true);
  }, [manager]);

  useEffect(() => {
    const active = new Set(snapshot.overlays.filter((entry) => entry.modal).map((entry) => entry.id));
    for (const [id, release] of lockReleases.current) {
      if (!active.has(id)) {
        release();
        lockReleases.current.delete(id);
      }
    }
    for (const id of active) {
      if (!lockReleases.current.has(id)) lockReleases.current.set(id, acquireScrollLock());
    }
    return () => {
      for (const release of lockReleases.current.values()) release();
      lockReleases.current.clear();
    };
  }, [snapshot]);

  useEffect(() => () => {
    for (const release of lockReleases.current.values()) release();
    lockReleases.current.clear();
  }, []);

  return createElement(
    "div",
    { "data-overlay-host": "" },
    snapshot.overlays.map((entry) =>
      createElement(
        "div",
        {
          key: entry.id,
          ref: (element: HTMLDivElement | null) => {
            if (element) entryRefs.current.set(entry.id, element);
            else entryRefs.current.delete(entry.id);
          },
          "data-overlay-id": entry.id,
          "data-overlay-modal": entry.modal ? "true" : undefined,
        },
        render(entry, {
          close: () => manager.close(entry.id),
          closeTop: manager.closeTop,
        }),
      ),
    ),
  );
}

export type OverlayProviderProps<D extends OverlayDefinitions> = Readonly<{
  children?: ReactNode;
  manager?: OverlayManager<D>;
  render?: OverlayRenderer<D>;
  /** A portal target. When omitted, the body is selected after mount. */
  portalTarget?: Element | null;
}>;

/** Provides an overlay manager and, when render is supplied, its portal host. */
export function OverlayProvider<D extends OverlayDefinitions>({
  children,
  manager: providedManager,
  render,
  portalTarget,
}: OverlayProviderProps<D>): ReactNode {
  const manager = useMemo(() => providedManager ?? createOverlayManager<D>(), [providedManager]);
  const [defaultTarget, setDefaultTarget] = useState<Element | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!portalTarget && typeof document !== "undefined") setDefaultTarget(document.body);
  }, [portalTarget]);
  const target = portalTarget === undefined ? defaultTarget : portalTarget;
  const host = render && target ? createPortal(<OverlayPortalHost manager={manager} render={render} />, target) : null;
  return <OverlayContext.Provider value={manager as unknown as OverlayContextValue}>{children}{host}</OverlayContext.Provider>;
}

/** Accesses the nearest provider's manager. */
export function useOverlayManager<D extends OverlayDefinitions>(): OverlayManager<D> {
  const manager = useContext(OverlayContext);
  if (!manager) throw new Error("useOverlayManager must be used inside OverlayProvider.");
  return manager as unknown as OverlayManager<D>;
}

export type UseOverlayResult<D extends OverlayDefinitions> = Readonly<{
  overlays: readonly OverlayEntry<D>[];
  manager: OverlayManager<D>;
  open: OverlayManager<D>["open"];
  close: OverlayManager<D>["close"];
  closeTop: OverlayManager<D>["closeTop"];
  replace: OverlayManager<D>["replace"];
  clear: OverlayManager<D>["clear"];
}>;

/** Subscribes to the manager with useSyncExternalStore for concurrent React. */
export function useOverlay<D extends OverlayDefinitions>(): UseOverlayResult<D> {
  const manager = useOverlayManager<D>();
  const snapshot = useOverlaySnapshot(manager);
  return {
    overlays: snapshot.overlays,
    manager,
    open: manager.open,
    close: manager.close,
    closeTop: manager.closeTop,
    replace: manager.replace,
    clear: manager.clear,
  };
}

/** Explicitly named hook alias for consumers that prefer the stack terminology. */
export const useOverlayStack = useOverlay;

export type { OverlayOpenOptions, OverlayRequest };
