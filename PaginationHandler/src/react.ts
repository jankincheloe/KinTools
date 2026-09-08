import { useCallback, useMemo, useState } from "react";

import {
  createPaginationState,
  getPaginationInfo,
  paginationReducer,
  paginationStatesEqual,
  type CursorNavigationOptions,
  type PageSizeChangeStrategy,
  type PaginationAction,
  type PaginationInfo,
  type PaginationInput,
  type PaginationState,
} from "./core.js";

type PaginationHookBase = {
  defaultPageSize?: number;
  pageSizeStrategy?: PageSizeChangeStrategy;
};

type UncontrolledPaginationOptions =
  | (PaginationInput & PaginationHookBase & {
      defaultValue?: PaginationInput;
      value?: never;
      onChange?: never;
    });

type ControlledPaginationOptions =
  | (PaginationInput & PaginationHookBase & {
      defaultValue?: PaginationInput;
      /** Controlled state requires its change callback. */
      value: PaginationState;
      onChange: (state: PaginationState) => void;
    });

/** Controlled and uncontrolled forms intentionally cannot be mixed. */
export type UsePaginationOptions = UncontrolledPaginationOptions | ControlledPaginationOptions;

export type UsePaginationResult = {
  state: PaginationState;
  info: PaginationInfo;
  dispatch: (action: PaginationAction) => void;
  first: () => void;
  previous: (options?: CursorNavigationOptions) => void;
  next: (options?: CursorNavigationOptions) => void;
  last: (options?: CursorNavigationOptions) => void;
  setPageSize: (pageSize: number, strategy?: PageSizeChangeStrategy) => void;
  setTotalItems: (totalItems: number | null | undefined) => void;
  setItemCount: (itemCount: number | null | undefined, hasNext?: boolean) => void;
  setCursorPage: (options: CursorNavigationOptions, recordHistory?: boolean) => void;
};

/**
 * React adapter supporting both controlled (`value` + `onChange`) and
 * uncontrolled (`defaultValue` or mode fields) usage. It renders no UI.
 */
export function usePagination(options: UsePaginationOptions): UsePaginationResult {
  const {
    value,
    onChange,
    defaultPageSize,
    pageSizeStrategy,
    defaultValue,
    mode,
    pageSize,
    itemCount,
    hasNext,
  } = options;
  const page = mode === "page" ? options.page : undefined;
  const totalItems = mode === "page" ? options.totalItems : undefined;
  const hasPrevious = mode === "cursor" ? options.hasPrevious : undefined;
  const cursor = mode === "cursor" ? options.cursor : undefined;
  const nextCursor = mode === "cursor" ? options.nextCursor : undefined;
  const previousCursor = mode === "cursor" ? options.previousCursor : undefined;
  const lastCursor = mode === "cursor" ? options.lastCursor : undefined;
  const history = mode === "cursor" ? options.history : undefined;
  const initialInput = useMemo<PaginationInput>(
    () => defaultValue ?? ({
      mode,
      ...(mode === "page"
        ? { page, pageSize, totalItems, itemCount, hasNext }
        : { cursor, pageSize, itemCount, hasNext, hasPrevious, nextCursor, previousCursor, lastCursor, history }),
    } as PaginationInput),
    [defaultValue, mode, page, pageSize, totalItems, itemCount, hasNext, hasPrevious, cursor, nextCursor, previousCursor, lastCursor, history],
  );
  const [internal, setInternal] = useState<PaginationState>(() =>
    createPaginationState(initialInput, defaultPageSize),
  );
  const controlled = value !== undefined;
  const state = controlled ? createPaginationState(value, defaultPageSize) : internal;

  const dispatch = useCallback(
    (action: PaginationAction) => {
      const next = paginationReducer(state, action, defaultPageSize, pageSizeStrategy);
      if (paginationStatesEqual(next, state)) return;
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [state, defaultPageSize, pageSizeStrategy, controlled, onChange],
  );

  return {
    state,
    info: getPaginationInfo(state),
    dispatch,
    first: () => dispatch({ type: "first" }),
    previous: (navigationOptions) => dispatch({ type: "previous", options: navigationOptions }),
    next: (navigationOptions) => dispatch({ type: "next", options: navigationOptions }),
    last: (navigationOptions) => dispatch({ type: "last", options: navigationOptions }),
    setPageSize: (nextPageSize, strategy) => dispatch({ type: "set-page-size", pageSize: nextPageSize, strategy }),
    setTotalItems: (nextTotalItems) => dispatch({ type: "set-total-items", totalItems: nextTotalItems }),
    setItemCount: (nextItemCount, nextHasNext) => dispatch({ type: "set-item-count", itemCount: nextItemCount, hasNext: nextHasNext }),
    setCursorPage: (navigationOptions, recordHistory = false) => dispatch({ type: "set-cursor-page", options: navigationOptions, recordHistory }),
  };
}
