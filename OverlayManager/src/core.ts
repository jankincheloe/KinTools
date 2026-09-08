/** A map from an application-defined overlay type to its payload type. */
export type OverlayDefinitions = object;

export type OverlayType<D extends OverlayDefinitions> = Extract<keyof D, string | number | symbol>;

export type OverlayEntry<
  D extends OverlayDefinitions,
  K extends OverlayType<D> = OverlayType<D>,
> = Readonly<{
  readonly id: string;
  readonly type: K;
  readonly payload: D[K];
  /** Higher layers are rendered above lower layers. Equal layers retain open order. */
  readonly layer: number;
  readonly modal: boolean;
  readonly dismissible: boolean;
}>;

export type OverlayOpenOptions = Readonly<{
  id?: string;
  layer?: number;
  modal?: boolean;
  dismissible?: boolean;
}>;

export type OverlayRequest<
  D extends OverlayDefinitions,
  K extends OverlayType<D> = OverlayType<D>,
> = Readonly<{
  type: K;
  payload: D[K];
} & OverlayOpenOptions>;

export type OverlayIdFactory = () => string;

export type OverlayStackState<D extends OverlayDefinitions> = Readonly<{
  overlays: readonly OverlayEntry<D>[];
}>;

export type OverlayManager<D extends OverlayDefinitions> = Readonly<{
  getSnapshot: () => OverlayStackState<D>;
  /** Alias for getSnapshot for callers that prefer state terminology. */
  getState: () => OverlayStackState<D>;
  subscribe: (listener: () => void) => () => void;
  open: {
    <K extends OverlayType<D>>(request: OverlayRequest<D, K>): string;
    <K extends OverlayType<D>>(type: K, payload: D[K], options?: OverlayOpenOptions): string;
  };
  close: (id: string) => boolean;
  /** Closes only the topmost entry, and only when that entry is dismissible. */
  closeTop: () => string | undefined;
  /** Returns the topmost entry, regardless of its dismissibility. */
  getTop: () => OverlayEntry<D> | undefined;
  /** Returns the top entry only when it is dismissible. */
  getTopDismissible: () => OverlayEntry<D> | undefined;
  /** Returns the highest-layer active modal entry, regardless of entries above it. */
  getTopModal: () => OverlayEntry<D> | undefined;
  replace: {
    <K extends OverlayType<D>>(id: string, request: OverlayRequest<D, K>): string | undefined;
    <K extends OverlayType<D>>(request: OverlayRequest<D, K>): string | undefined;
  };
  /** Removes all entries and returns the number removed. */
  clear: () => number;
}>;

export type CreateOverlayManagerOptions = Readonly<{
  idFactory?: OverlayIdFactory;
}>;

const DEFAULT_LAYER = 0;

function own<T extends object, K extends PropertyKey>(value: T, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function freezeEntry<D extends OverlayDefinitions>(entry: OverlayEntry<D>): OverlayEntry<D> {
  return Object.freeze(entry);
}

function freezeState<D extends OverlayDefinitions>(overlays: readonly OverlayEntry<D>[]): OverlayStackState<D> {
  return Object.freeze({ overlays: Object.freeze([...overlays]) });
}

function validLayer(layer: number | undefined): number {
  return typeof layer === "number" && Number.isFinite(layer) ? layer : DEFAULT_LAYER;
}

function validateId(id: string): string {
  if (typeof id !== "string" || id.length === 0) throw new Error("Overlay IDs must be non-empty strings.");
  return id;
}

/** Creates an immutable, subscribable overlay stack without importing React or DOM APIs. */
export function createOverlayManager<D extends OverlayDefinitions>(
  options: CreateOverlayManagerOptions = {},
): OverlayManager<D> {
  const listeners = new Set<() => void>();
  const idFactory = options.idFactory ?? (() => `overlay-${++sequence}`);
  let sequence = 0;
  let overlays: readonly OverlayEntry<D>[] = [];
  let snapshot = freezeState(overlays);

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const commit = (next: readonly OverlayEntry<D>[]): void => {
    overlays = next;
    snapshot = freezeState(overlays);
    emit();
  };

  const nextId = (requested: string | undefined, occupied: ReadonlySet<string>): string => {
    if (requested !== undefined) {
      const id = validateId(requested);
      if (occupied.has(id)) throw new Error(`Overlay ID already exists: ${id}`);
      return id;
    }
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const id = validateId(idFactory());
      if (!occupied.has(id)) return id;
    }
    throw new Error("Unable to create a unique overlay ID.");
  };

  const normalize = <K extends OverlayType<D>>(
    request: OverlayRequest<D, K>,
    id: string,
    fallback?: OverlayEntry<D>,
  ): OverlayEntry<D> =>
    freezeEntry({
      id,
      type: request.type,
      payload: request.payload,
      layer: validLayer(request.layer ?? fallback?.layer),
      modal: request.modal ?? fallback?.modal ?? false,
      dismissible: request.dismissible ?? fallback?.dismissible ?? true,
    } as OverlayEntry<D>);

  const order = (next: readonly OverlayEntry<D>[]): readonly OverlayEntry<D>[] => {
    // ES2022 specifies stable sorting. The index tiebreaker also documents and
    // preserves the intended order when a custom JS engine is used.
    return next
      .map((value, index) => ({ value, index }))
      .sort((left, right) => left.value.layer - right.value.layer || left.index - right.index)
      .map(({ value }) => value);
  };
  const insert = (entry: OverlayEntry<D>, source = overlays): readonly OverlayEntry<D>[] => order([...source, entry]);

  const open = <K extends OverlayType<D>>(
    requestOrType: OverlayRequest<D, K> | K,
    payload?: D[K],
    openOptions: OverlayOpenOptions = {},
  ): string => {
    const request = (
      typeof requestOrType === "object" && requestOrType !== null
        ? requestOrType
        : { type: requestOrType, payload: payload as D[K], ...openOptions }
    ) as OverlayRequest<D, K>;
    const occupied = new Set(overlays.map((entry) => entry.id));
    const id = nextId(request.id, occupied);
    commit(insert(normalize(request, id)));
    return id;
  };

  const close = (id: string): boolean => {
    const index = overlays.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    commit([...overlays.slice(0, index), ...overlays.slice(index + 1)]);
    return true;
  };

  const getTop = (): OverlayEntry<D> | undefined => overlays[overlays.length - 1];
  const getTopDismissible = (): OverlayEntry<D> | undefined => {
    const top = getTop();
    return top?.dismissible ? top : undefined;
  };
  const getTopModal = (): OverlayEntry<D> | undefined => {
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      if (overlays[index].modal) return overlays[index];
    }
    return undefined;
  };
  const closeTop = (): string | undefined => {
    const top = getTopDismissible();
    if (!top) return undefined;
    close(top.id);
    return top.id;
  };

  const replace = <K extends OverlayType<D>>(
    idOrRequest: string | OverlayRequest<D, K>,
    maybeRequest?: OverlayRequest<D, K>,
  ): string | undefined => {
    const id = typeof idOrRequest === "string" ? idOrRequest : getTop()?.id;
    const request = (typeof idOrRequest === "string" ? maybeRequest : idOrRequest) as OverlayRequest<D, K> | undefined;
    if (!id || !request) return undefined;
    const index = overlays.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const current = overlays[index];
    const requestedId = request.id ?? id;
    const occupied = new Set(overlays.filter((entry) => entry.id !== id).map((entry) => entry.id));
    const replacementId = nextId(requestedId, occupied);
    const replacement = normalize(request, replacementId, current);
    const source = [...overlays.slice(0, index), ...overlays.slice(index + 1)];
    // Keep the replaced entry's position for equal layers; a changed layer is
    // still moved by the normal ordering pass.
    source.splice(index, 0, replacement);
    commit(order(source));
    return replacementId;
  };

  const clear = (): number => {
    const count = overlays.length;
    if (count > 0) commit([]);
    return count;
  };

  const manager: OverlayManager<D> = {
    getSnapshot: () => snapshot,
    getState: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open,
    close,
    closeTop,
    getTop,
    getTopDismissible,
    getTopModal,
    replace,
    clear,
  };
  return manager;
}

/** Alias emphasizing that the returned value is a stack primitive. */
export const createOverlayStack = createOverlayManager;
