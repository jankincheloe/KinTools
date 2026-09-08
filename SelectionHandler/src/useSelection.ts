import { useCallback, useState } from "react";

import {
  clearSelection,
  createSelectionState,
  isSelected,
  selectAllResults,
  selectMany,
  selectPage,
  selectRange,
  selectOne,
  selectedCount,
  selectionStatus,
  togglePageSelection,
  toggleSelection,
  type SelectionId,
  type SelectionOptions,
  type SelectionState,
  type SelectionStatus,
} from "./core.js";

export type UseSelectionOptions<Id extends SelectionId> = {
  /** Supplied state makes the hook controlled. */
  value?: SelectionState<Id>;
  defaultValue?: Partial<SelectionState<Id>> | null;
  onChange?: (nextState: SelectionState<Id>) => void;
  maxSelection?: number;
  totalCount?: number;
};

export type UseSelectionResult<Id extends SelectionId> = {
  state: SelectionState<Id>;
  mode: SelectionState<Id>["mode"];
  selectedIds: readonly Id[];
  excludedIds: readonly Id[];
  isSelected: (id: Id) => boolean;
  status: (pageIds: readonly Id[]) => SelectionStatus;
  count: (totalCount?: number) => number | undefined;
  select: (id: Id, options?: Omit<SelectionOptions<Id>, "maxSelection" | "totalCount">) => void;
  selectMany: (ids: readonly Id[], options?: Omit<SelectionOptions<Id>, "maxSelection" | "totalCount">) => void;
  toggle: (id: Id) => void;
  clear: () => void;
  selectPage: (pageIds: readonly Id[]) => void;
  togglePage: (pageIds: readonly Id[]) => void;
  selectRange: (orderedIds: readonly Id[], anchorId: Id, targetId: Id) => void;
  selectAllResults: (totalCount?: number) => void;
};

/**
 * React adapter for the immutable core. Pass `value` and `onChange` for
 * controlled usage, or `defaultValue` for local state.
 */
export function useSelection<Id extends SelectionId>(
  options: UseSelectionOptions<Id> = {},
): UseSelectionResult<Id> {
  const [uncontrolledState, setUncontrolledState] = useState<SelectionState<Id>>(
    () => createSelectionState(options.defaultValue),
  );
  const controlled = options.value !== undefined;
  const state = options.value ?? uncontrolledState;

  const commit = useCallback(
    (nextState: SelectionState<Id>) => {
      if (!controlled) setUncontrolledState(nextState);
      options.onChange?.(nextState);
    },
    [controlled, options.onChange],
  );
  const operationOptions = useCallback(
    (extra?: SelectionOptions<Id>): SelectionOptions<Id> => ({
      ...extra,
      maxSelection: options.maxSelection,
      totalCount: options.totalCount,
    }),
    [options.maxSelection, options.totalCount],
  );

  const select = useCallback(
    (id: Id, extra?: Omit<SelectionOptions<Id>, "maxSelection" | "totalCount">) =>
      commit(selectOne(state, id, operationOptions(extra))),
    [commit, operationOptions, state],
  );
  const selectManyAction = useCallback(
    (ids: readonly Id[], extra?: Omit<SelectionOptions<Id>, "maxSelection" | "totalCount">) =>
      commit(selectMany(state, ids, operationOptions(extra))),
    [commit, operationOptions, state],
  );
  const toggle = useCallback((id: Id) => commit(toggleSelection(state, id, operationOptions())), [commit, operationOptions, state]);
  const clear = useCallback(() => commit(clearSelection(state)), [commit, state]);
  const selectPageAction = useCallback(
    (pageIds: readonly Id[]) => commit(selectPage(state, pageIds, operationOptions())),
    [commit, operationOptions, state],
  );
  const togglePage = useCallback(
    (pageIds: readonly Id[]) => commit(togglePageSelection(state, pageIds, operationOptions())),
    [commit, operationOptions, state],
  );
  const selectRangeAction = useCallback(
    (orderedIds: readonly Id[], anchorId: Id, targetId: Id) =>
      commit(selectRange(state, orderedIds, anchorId, targetId, operationOptions())),
    [commit, operationOptions, state],
  );
  const selectAllResultsAction = useCallback(
    (totalCount?: number) =>
      commit(selectAllResults(state, operationOptions({ totalCount: totalCount ?? options.totalCount }))),
    [commit, operationOptions, options.totalCount, state],
  );

  return {
    state,
    mode: state.mode,
    selectedIds: state.selectedIds,
    excludedIds: state.excludedIds,
    isSelected: (id) => isSelected(state, id),
    status: (pageIds) => selectionStatus(state, pageIds),
    count: (totalCount) => selectedCount(state, totalCount ?? options.totalCount),
    select,
    selectMany: selectManyAction,
    toggle,
    clear,
    selectPage: selectPageAction,
    togglePage,
    selectRange: selectRangeAction,
    selectAllResults: selectAllResultsAction,
  };
}
