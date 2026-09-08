/**
 * Headless pagination primitives. The `mode` property is deliberately
 * discriminated: page pagination and cursor pagination have different
 * navigation guarantees and must not be mixed accidentally.
 */

export type PageSizeChangeContext = {
  page: number;
  pageSize: number;
  nextPageSize: number;
  totalItems?: number;
  totalPages?: number;
};

export type PageSizeChangeStrategy =
  | "reset"
  | "preserve-first-item"
  | ((context: PageSizeChangeContext) => number);

export type PagePaginationInput = {
  mode: "page";
  page?: number;
  pageSize?: number;
  totalItems?: number | null;
  /** Number of records returned for the current page, when known. */
  itemCount?: number | null;
  /** Useful when a server does not return a total count. */
  hasNext?: boolean;
};

export type CursorPaginationInput = {
  mode: "cursor";
  cursor?: string | null;
  pageSize?: number;
  itemCount?: number | null;
  hasNext?: boolean;
  hasPrevious?: boolean;
  nextCursor?: string | null;
  previousCursor?: string | null;
  lastCursor?: string | null;
  history?: readonly (string | null)[];
};

export type PaginationInput = PagePaginationInput | CursorPaginationInput;

export type PagePaginationState = {
  readonly mode: "page";
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems?: number;
  readonly itemCount?: number;
  readonly hasNext?: boolean;
};

export type CursorPaginationState = {
  readonly mode: "cursor";
  readonly cursor: string | null;
  readonly pageSize: number;
  readonly itemCount?: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly nextCursor: string | null;
  readonly previousCursor: string | null;
  readonly lastCursor: string | null;
  /** Cursors visited before the current cursor, oldest first. */
  readonly history: readonly (string | null)[];
};

export type PaginationState = PagePaginationState | CursorPaginationState;

export type PaginationRange = {
  readonly start: number;
  readonly end: number;
};

export type PaginationInfo = {
  readonly totalPages?: number;
  readonly range: PaginationRange;
  readonly canPrevious: boolean;
  readonly canNext: boolean;
  readonly canFirst: boolean;
  readonly canLast: boolean;
};

export type CursorNavigationOptions = {
  cursor?: string | null;
  itemCount?: number | null;
  hasNext?: boolean;
  hasPrevious?: boolean;
  nextCursor?: string | null;
  previousCursor?: string | null;
  lastCursor?: string | null;
};

export type PaginationAction =
  | { type: "first" }
  | { type: "previous"; options?: CursorNavigationOptions }
  | { type: "next"; options?: CursorNavigationOptions }
  | { type: "last"; options?: CursorNavigationOptions }
  | { type: "set-page-size"; pageSize: number; strategy?: PageSizeChangeStrategy }
  | { type: "set-total-items"; totalItems: number | null | undefined }
  | { type: "set-item-count"; itemCount: number | null | undefined; hasNext?: boolean }
  | { type: "set-cursor-page"; options: CursorNavigationOptions; recordHistory?: boolean }
  | { type: "set-state"; state: PaginationInput };

export type CreatePaginationOptions = PaginationInput & {
  /** Default used when pageSize is omitted or invalid. */
  defaultPageSize?: number;
  /** Used by set-page-size when no strategy is passed with the action. */
  pageSizeStrategy?: PageSizeChangeStrategy;
};

export type PaginationController = {
  getState: () => PaginationState;
  getInfo: () => PaginationInfo;
  dispatch: (action: PaginationAction) => PaginationState;
  setState: (state: PaginationInput) => PaginationState;
  first: () => PaginationState;
  previous: (options?: CursorNavigationOptions) => PaginationState;
  next: (options?: CursorNavigationOptions) => PaginationState;
  last: (options?: CursorNavigationOptions) => PaginationState;
  setPageSize: (pageSize: number, strategy?: PageSizeChangeStrategy) => PaginationState;
  setTotalItems: (totalItems: number | null | undefined) => PaginationState;
  setItemCount: (itemCount: number | null | undefined, hasNext?: boolean) => PaginationState;
  setCursorPage: (options: CursorNavigationOptions, recordHistory?: boolean) => PaginationState;
  subscribe: (listener: () => void) => () => void;
};

export type PaginationQueryValues = {
  mode: "page" | "cursor";
  pageSize: number;
  page?: number;
  cursor?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function finiteInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function optionalTotal(value: unknown): number | undefined {
  return optionalNonNegativeInteger(value);
}

function optionalCursor(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const safeFallback = finiteInteger(fallback, DEFAULT_PAGE_SIZE, 1);
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : safeFallback;
}

function normalizeItemCount(value: unknown): number | undefined {
  return optionalNonNegativeInteger(value);
}

function normalizeHistory(value: unknown): (string | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((cursor) => optionalCursor(cursor));
}

/** Normalizes untrusted input without mutating it or throwing. */
export function normalizePaginationState(
  input: PaginationInput | null | undefined,
  defaultPageSize = DEFAULT_PAGE_SIZE,
): PaginationState {
  const source = input && typeof input === "object" ? input : ({ mode: "page" } as PagePaginationInput);
  const pageSize = normalizePageSize((source as PaginationInput).pageSize, defaultPageSize);

  if (source.mode === "cursor") {
    const nextCursor = optionalCursor(source.nextCursor);
    const previousCursor = optionalCursor(source.previousCursor);
    const explicitHasNext = optionalBoolean(source.hasNext);
    const explicitHasPrevious = optionalBoolean(source.hasPrevious);
    const history = normalizeHistory(source.history);
    return {
      mode: "cursor",
      cursor: optionalCursor(source.cursor),
      pageSize,
      itemCount: normalizeItemCount(source.itemCount),
      hasNext: explicitHasNext ?? nextCursor !== null,
      hasPrevious: explicitHasPrevious ?? (previousCursor !== null || history.length > 0),
      nextCursor,
      previousCursor,
      lastCursor: optionalCursor(source.lastCursor),
      history,
    };
  }

  const page = finiteInteger(source.page, 1, 1);
  const totalItems = optionalTotal(source.totalItems);
  const totalPages = totalItems === undefined ? undefined : Math.ceil(totalItems / pageSize);
  return {
    mode: "page",
    page: totalPages === undefined || totalPages === 0 ? 1 : Math.min(page, totalPages),
    pageSize,
    totalItems,
    itemCount: normalizeItemCount(source.itemCount),
    hasNext: optionalBoolean(source.hasNext),
  };
}

export const createPaginationState = normalizePaginationState;

function pageTotalPages(state: PagePaginationState): number | undefined {
  return state.totalItems === undefined ? undefined : Math.ceil(state.totalItems / state.pageSize);
}

/** Derives navigation affordances and a one-based visible range. */
export function getPaginationInfo(stateInput: PaginationState | PaginationInput): PaginationInfo {
  const state = normalizePaginationState(stateInput);
  if (state.mode === "page") {
    const totalPages = pageTotalPages(state);
    const canPrevious = state.page > 1;
    const canNext = totalPages !== undefined
      ? state.page < totalPages
      : state.hasNext ?? (state.itemCount !== undefined && state.itemCount >= state.pageSize);
    const count = state.totalItems === 0
      ? 0
      : state.itemCount ?? (state.totalItems === undefined
        ? state.pageSize
        : Math.max(0, Math.min(state.pageSize, state.totalItems - (state.page - 1) * state.pageSize)));
    const start = count === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    return {
      totalPages,
      range: { start, end: count === 0 ? 0 : start + count - 1 },
      canPrevious,
      canNext: Boolean(canNext),
      canFirst: canPrevious,
      canLast: totalPages !== undefined && state.page < totalPages,
    };
  }

  const pageIndex = state.history.length + 1;
  const canPrevious = state.history.length > 0 || state.hasPrevious;
  const count = state.itemCount ?? state.pageSize;
  const start = count === 0 ? 0 : (pageIndex - 1) * state.pageSize + 1;
  return {
    totalPages: undefined,
    range: { start, end: count === 0 ? 0 : start + count - 1 },
    canPrevious,
    canNext: state.hasNext,
    canFirst: state.cursor !== null || state.history.length > 0,
    canLast: state.lastCursor !== null,
  };
}

function normalizedCursorOptions(options: CursorNavigationOptions | undefined): CursorNavigationOptions {
  const source = options ?? {};
  return {
    ...(hasOwn(source, "cursor") ? { cursor: optionalCursor(source.cursor) } : {}),
    ...(hasOwn(source, "itemCount") ? { itemCount: normalizeItemCount(source.itemCount) } : {}),
    ...(hasOwn(source, "hasNext") && typeof source.hasNext === "boolean" ? { hasNext: source.hasNext } : {}),
    ...(hasOwn(source, "hasPrevious") && typeof source.hasPrevious === "boolean"
      ? { hasPrevious: source.hasPrevious }
      : {}),
    ...(hasOwn(source, "nextCursor") ? { nextCursor: optionalCursor(source.nextCursor) } : {}),
    ...(hasOwn(source, "previousCursor") ? { previousCursor: optionalCursor(source.previousCursor) } : {}),
    ...(hasOwn(source, "lastCursor") ? { lastCursor: optionalCursor(source.lastCursor) } : {}),
  };
}

function applyCursorMetadata(
  state: CursorPaginationState,
  options: CursorNavigationOptions | undefined,
): CursorPaginationState {
  const safe = normalizedCursorOptions(options);
  return {
    ...state,
    itemCount: hasOwn(safe, "itemCount") ? normalizeItemCount(safe.itemCount) : undefined,
    hasNext: safe.hasNext ?? (hasOwn(safe, "nextCursor") && safe.nextCursor !== null),
    hasPrevious: safe.hasPrevious ?? (hasOwn(safe, "previousCursor") && safe.previousCursor !== null),
    nextCursor: safe.nextCursor ?? null,
    previousCursor: safe.previousCursor ?? null,
    lastCursor: safe.lastCursor ?? state.lastCursor,
  };
}

function pageSizeTarget(
  state: PagePaginationState,
  requestedSize: number,
  strategy: PageSizeChangeStrategy,
): number {
  const totalPages = pageTotalPages(state);
  const context: PageSizeChangeContext = {
    page: state.page,
    pageSize: state.pageSize,
    nextPageSize: requestedSize,
    ...(state.totalItems === undefined ? {} : { totalItems: state.totalItems }),
    ...(totalPages === undefined ? {} : { totalPages }),
  };
  let target: number;
  if (strategy === "reset") target = 1;
  else if (strategy === "preserve-first-item") {
    target = Math.floor(((state.page - 1) * state.pageSize) / requestedSize) + 1;
  } else {
    try {
      target = strategy(context);
    } catch {
      target = 1;
    }
  }
  const safe = finiteInteger(target, 1, 1);
  const nextTotalPages = state.totalItems === undefined ? undefined : Math.ceil(state.totalItems / requestedSize);
  return nextTotalPages === undefined || nextTotalPages === 0 ? safe : Math.min(safe, nextTotalPages);
}

/** Pure immutable state transition function. */
export function paginationReducer(
  previous: PaginationState | PaginationInput,
  action: PaginationAction,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  defaultStrategy: PageSizeChangeStrategy = "preserve-first-item",
): PaginationState {
  const state = normalizePaginationState(previous, defaultPageSize);
  switch (action.type) {
    case "set-state":
      return normalizePaginationState(action.state, defaultPageSize);
    case "set-page-size": {
      const pageSize = normalizePageSize(action.pageSize, state.pageSize);
      if (state.mode === "cursor") {
        if (pageSize === state.pageSize) return state;
        return {
          mode: "cursor",
          cursor: null,
          pageSize,
          itemCount: undefined,
          hasNext: false,
          hasPrevious: false,
          nextCursor: null,
          previousCursor: null,
          lastCursor: state.lastCursor,
          history: [],
        };
      }
      const page = pageSizeTarget(state, pageSize, action.strategy ?? defaultStrategy);
      if (pageSize === state.pageSize && page === state.page) return state;
      return { ...state, pageSize, page };
    }
    case "set-total-items": {
      if (state.mode === "cursor") return state;
      const totalItems = optionalTotal(action.totalItems);
      const totalPages = totalItems === undefined ? undefined : Math.ceil(totalItems / state.pageSize);
      return {
        ...state,
        ...(totalItems === undefined ? { totalItems: undefined } : { totalItems }),
        page: totalPages === undefined || totalPages === 0 ? 1 : Math.min(state.page, totalPages),
      };
    }
    case "set-item-count": {
      const itemCount = normalizeItemCount(action.itemCount);
      if (state.mode === "page") {
        return { ...state, itemCount, ...(typeof action.hasNext === "boolean" ? { hasNext: action.hasNext } : {}) };
      }
      return { ...state, itemCount, ...(typeof action.hasNext === "boolean" ? { hasNext: action.hasNext } : {}) };
    }
    case "set-cursor-page": {
      if (state.mode !== "cursor") return state;
      const options = normalizedCursorOptions(action.options);
      const cursor = hasOwn(options, "cursor") ? options.cursor ?? null : state.cursor;
      if (action.recordHistory && cursor !== state.cursor) {
        return applyCursorMetadata(
          { ...state, cursor, history: [...state.history, state.cursor] },
          options,
        );
      }
      return applyCursorMetadata({ ...state, cursor }, options);
    }
    case "first": {
      if (state.mode === "page") return state.page === 1 ? state : { ...state, page: 1 };
      return state.cursor === null && state.history.length === 0 ? state : {
        ...state,
        cursor: null,
        history: [],
        itemCount: undefined,
        hasNext: false,
        hasPrevious: false,
        nextCursor: null,
        previousCursor: null,
      };
    }
    case "last": {
      if (state.mode === "page") {
        const totalPages = pageTotalPages(state);
        return totalPages === undefined || totalPages === state.page
          ? state
          : { ...state, page: totalPages === 0 ? 1 : totalPages };
      }
      const options = normalizedCursorOptions(action.options);
      const cursor = hasOwn(options, "cursor") ? options.cursor ?? null : state.lastCursor;
      if (cursor === null || cursor === state.cursor) return state;
      return applyCursorMetadata({ ...state, cursor, history: [...state.history, state.cursor] }, options);
    }
    case "previous": {
      if (state.mode === "page") return state.page <= 1 ? state : { ...state, page: state.page - 1 };
      const options = normalizedCursorOptions(action.options);
      const history = [...state.history];
      const hasHistoryTarget = history.length > 0;
      const target = hasOwn(options, "cursor")
        ? options.cursor ?? null
        : hasHistoryTarget
          ? history.pop()!
          : state.previousCursor;
      const hasTarget = hasOwn(options, "cursor") || hasHistoryTarget || state.previousCursor !== null;
      if (!hasTarget || target === state.cursor) return state;
      return applyCursorMetadata({ ...state, cursor: target, history }, options);
    }
    case "next": {
      if (state.mode === "page") {
        const info = getPaginationInfo(state);
        return info.canNext ? { ...state, page: state.page + 1 } : state;
      }
      const options = normalizedCursorOptions(action.options);
      const target = hasOwn(options, "cursor") ? options.cursor ?? null : state.nextCursor;
      const hasTarget = hasOwn(options, "cursor") || state.nextCursor !== null;
      if (!hasTarget || target === state.cursor) return state;
      return applyCursorMetadata({ ...state, cursor: target, history: [...state.history, state.cursor] }, options);
    }
  }
}

/** Structural equality for controlled adapters and external-store updates. */
export function paginationStatesEqual(left: PaginationState, right: PaginationState): boolean {
  if (left.mode !== right.mode || left.pageSize !== right.pageSize) return false;
  if (left.mode === "page" && right.mode === "page") {
    return left.page === right.page
      && left.totalItems === right.totalItems
      && left.itemCount === right.itemCount
      && left.hasNext === right.hasNext;
  }
  if (left.mode !== "cursor" || right.mode !== "cursor") return false;
  return left.cursor === right.cursor
    && left.itemCount === right.itemCount
    && left.hasNext === right.hasNext
    && left.hasPrevious === right.hasPrevious
    && left.nextCursor === right.nextCursor
    && left.previousCursor === right.previousCursor
    && left.lastCursor === right.lastCursor
    && left.history.length === right.history.length
    && left.history.every((cursor, index) => cursor === right.history[index]);
}

/** Creates a small external-store-compatible controller around the pure core. */
export function createPagination(options: CreatePaginationOptions): PaginationController {
  const defaultPageSize = normalizePageSize(options.defaultPageSize, DEFAULT_PAGE_SIZE);
  const defaultStrategy = options.pageSizeStrategy ?? "preserve-first-item";
  let current = normalizePaginationState(options, defaultPageSize);
  const listeners = new Set<() => void>();
  const dispatch = (action: PaginationAction): PaginationState => {
    const next = paginationReducer(current, action, defaultPageSize, defaultStrategy);
    if (paginationStatesEqual(current, next)) return current;
    // Publish the snapshot before notifying subscribers. Consumers such as
    // useSyncExternalStore synchronously read getState() from the callback.
    current = next;
    listeners.forEach((listener) => listener());
    return current;
  };
  return {
    getState: () => current,
    getInfo: () => getPaginationInfo(current),
    dispatch,
    setState: (state) => dispatch({ type: "set-state", state }),
    first: () => dispatch({ type: "first" }),
    previous: (options) => dispatch({ type: "previous", options }),
    next: (options) => dispatch({ type: "next", options }),
    last: (options) => dispatch({ type: "last", options }),
    setPageSize: (pageSize, strategy) => dispatch({ type: "set-page-size", pageSize, strategy }),
    setTotalItems: (totalItems) => dispatch({ type: "set-total-items", totalItems }),
    setItemCount: (itemCount, hasNext) => dispatch({ type: "set-item-count", itemCount, hasNext }),
    setCursorPage: (options, recordHistory = false) => dispatch({ type: "set-cursor-page", options, recordHistory }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Converts state to URL/query friendly primitive values. */
export function paginationToQueryValues(stateInput: PaginationState | PaginationInput): PaginationQueryValues {
  const state = normalizePaginationState(stateInput);
  return state.mode === "page"
    ? { mode: "page", page: state.page, pageSize: state.pageSize }
    : { mode: "cursor", cursor: state.cursor, pageSize: state.pageSize };
}

/** Builds pagination input from values returned by a serializable query store. */
export function paginationFromQueryValues(
  mode: "page" | "cursor",
  values: Partial<PaginationQueryValues> | null | undefined,
): PaginationInput {
  const source = values ?? {};
  if (mode === "cursor") {
    return { mode, cursor: typeof source.cursor === "string" ? source.cursor : null, pageSize: source.pageSize };
  }
  return { mode, page: source.page, pageSize: source.pageSize };
}

export const toQueryValues = paginationToQueryValues;
export const fromQueryValues = paginationFromQueryValues;
