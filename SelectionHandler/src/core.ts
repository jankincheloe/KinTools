/** IDs are deliberately limited to primitives so that selection can be
 * serialised and compared consistently by tables, cards, and lists. */
export type SelectionId = string | number;

export type SelectionMode = "explicit" | "all";

export type SelectionState<Id extends SelectionId = SelectionId> = {
  /** In explicit mode, the selected IDs. Empty in all-results mode. */
  readonly selectedIds: readonly Id[];
  /** In all-results mode, IDs that are not selected. Empty in explicit mode. */
  readonly excludedIds: readonly Id[];
  readonly mode: SelectionMode;
};

export type SelectionOptions<Id extends SelectionId = SelectionId> = {
  /** A maximum of zero prevents every selection. Fractions are rounded down. */
  maxSelection?: number;
  /** Required when enforcing maxSelection for an all-results selection. */
  totalCount?: number;
  /** Add to the current explicit selection instead of replacing it. */
  multiple?: boolean;
  /** Alias for multiple, useful when calling selectMany directly. */
  additive?: boolean;
};

export type SelectionStatus = "none" | "some" | "all";

function unique<Id extends SelectionId>(ids: readonly Id[]): Id[] {
  return [...new Set(ids)];
}

function limitOf(maxSelection: number | undefined): number | undefined {
  if (maxSelection === undefined || !Number.isFinite(maxSelection)) return undefined;
  return Math.max(0, Math.floor(maxSelection));
}

function limited<Id extends SelectionId>(ids: readonly Id[], maxSelection?: number): Id[] {
  const uniqueIds = unique(ids);
  const limit = limitOf(maxSelection);
  return limit === undefined ? uniqueIds : uniqueIds.slice(0, limit);
}

function isAdditive(options?: SelectionOptions): boolean {
  return options?.multiple === true || options?.additive === true;
}

function allResultsFitsLimit(options?: SelectionOptions): boolean {
  const limit = limitOf(options?.maxSelection);
  return limit === undefined || (options?.totalCount !== undefined && options.totalCount <= limit);
}

/** Creates a fresh, normalised selection state. */
export function createSelectionState<Id extends SelectionId = SelectionId>(
  state?: Partial<SelectionState<Id>> | null,
): SelectionState<Id> {
  const mode = state?.mode === "all" ? "all" : "explicit";
  return mode === "all"
    ? { mode, selectedIds: [], excludedIds: unique(state?.excludedIds ?? []) }
    : { mode, selectedIds: unique(state?.selectedIds ?? []), excludedIds: [] };
}

/** Returns whether an ID is currently selected. */
export function isSelected<Id extends SelectionId>(state: SelectionState<Id>, id: Id): boolean {
  return state.mode === "all" ? !state.excludedIds.includes(id) : state.selectedIds.includes(id);
}

/** Selects one ID, replacing the selection unless `multiple` is true. */
export function selectOne<Id extends SelectionId>(
  state: SelectionState<Id>,
  id: Id,
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  if (state.mode === "all" && isAdditive(options)) {
    if (!allResultsFitsLimit(options)) return createSelectionState(state);
    return {
      mode: "all",
      selectedIds: [],
      excludedIds: state.excludedIds.filter((excludedId) => excludedId !== id),
    };
  }
  const selectedIds = isAdditive(options) ? [...state.selectedIds, id] : [id];
  return { mode: "explicit", selectedIds: limited(selectedIds, options?.maxSelection), excludedIds: [] };
}

/** Selects a set of IDs, replacing by default or adding with `multiple`. */
export function selectMany<Id extends SelectionId>(
  state: SelectionState<Id>,
  ids: readonly Id[],
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  const incoming = unique(ids);
  if (state.mode === "all" && isAdditive(options)) {
    if (!allResultsFitsLimit(options)) return createSelectionState(state);
    return {
      mode: "all",
      selectedIds: [],
      excludedIds: state.excludedIds.filter((id) => !incoming.includes(id)),
    };
  }
  const selectedIds = isAdditive(options) ? [...state.selectedIds, ...incoming] : incoming;
  return { mode: "explicit", selectedIds: limited(selectedIds, options?.maxSelection), excludedIds: [] };
}

/** Toggles an ID. In all-results mode, toggling adds/removes an exception. */
export function toggleSelection<Id extends SelectionId>(
  state: SelectionState<Id>,
  id: Id,
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  if (state.mode === "all") {
    const excluded = state.excludedIds.includes(id);
    const excludedIds = excluded
      ? state.excludedIds.filter((excludedId) => excludedId !== id)
      : [...state.excludedIds, id];
    return { mode: "all", selectedIds: [], excludedIds };
  }
  if (state.selectedIds.includes(id)) {
    return {
      mode: "explicit",
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
      excludedIds: [],
    };
  }
  return selectOne(state, id, { ...options, multiple: true });
}

/** Removes every selected ID and exits all-results mode. */
export function clearSelection<Id extends SelectionId>(): SelectionState<Id>;
export function clearSelection<Id extends SelectionId>(state: SelectionState<Id>): SelectionState<Id>;
export function clearSelection<Id extends SelectionId>(state?: SelectionState<Id>): SelectionState<Id> {
  // Accepting no argument makes reset handlers convenient while accepting the
  // state keeps all operations uniformly immutable and composable.
  void state;
  return { mode: "explicit", selectedIds: [], excludedIds: [] };
}

/** Selects every ID on a page while preserving selections from other pages. */
export function selectPage<Id extends SelectionId>(
  state: SelectionState<Id>,
  pageIds: readonly Id[],
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  return selectMany(state, pageIds, { ...options, multiple: true });
}

/** Toggles all IDs on a page as a group. */
export function togglePageSelection<Id extends SelectionId>(
  state: SelectionState<Id>,
  pageIds: readonly Id[],
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  const ids = unique(pageIds);
  if (ids.length > 0 && selectionStatus(state, ids) === "all") {
    if (state.mode === "all") {
      return {
        mode: "all",
        selectedIds: [],
        excludedIds: unique([...state.excludedIds, ...ids]),
      };
    }
    return {
      mode: "explicit",
      selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
      excludedIds: [],
    };
  }
  return selectPage(state, ids, options);
}

/** Adds the inclusive range between two IDs in an externally ordered list. */
export function selectRange<Id extends SelectionId>(
  state: SelectionState<Id>,
  orderedIds: readonly Id[],
  anchorId: Id,
  targetId: Id,
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  const start = orderedIds.indexOf(anchorId);
  const end = orderedIds.indexOf(targetId);
  if (start < 0 || end < 0) return createSelectionState(state);
  const [from, to] = start <= end ? [start, end] : [end, start];
  return selectMany(state, orderedIds.slice(from, to + 1), { ...options, multiple: true });
}

/** Enters all-results mode. With a max, totalCount must be supplied and fit. */
export function selectAllResults<Id extends SelectionId = SelectionId>(
  state: SelectionState<Id>,
  options?: SelectionOptions<Id>,
): SelectionState<Id> {
  if (!allResultsFitsLimit(options)) return createSelectionState(state);
  return { mode: "all", selectedIds: [], excludedIds: [] };
}

/** Exits all-results mode and keeps no implicit selections. */
export function clearAllResults<Id extends SelectionId>(state: SelectionState<Id>): SelectionState<Id> {
  return clearSelection(state);
}

/** Returns the checkbox status for a page. An empty page is `none`. */
export function selectionStatus<Id extends SelectionId>(
  state: SelectionState<Id>,
  pageIds: readonly Id[],
): SelectionStatus {
  const ids = unique(pageIds);
  if (ids.length === 0) return "none";
  const selected = ids.reduce((count, id) => count + (isSelected(state, id) ? 1 : 0), 0);
  return selected === 0 ? "none" : selected === ids.length ? "all" : "some";
}

/** Number of selected IDs when known; all-results needs a totalCount. */
export function selectedCount<Id extends SelectionId>(
  state: SelectionState<Id>,
  totalCount?: number,
): number | undefined {
  return state.mode === "explicit"
    ? state.selectedIds.length
    : totalCount === undefined
      ? undefined
      : Math.max(0, totalCount - state.excludedIds.length);
}

/** Materialises a state against an ordered universe of IDs without mutating it. */
export function selectedIdsFor<Id extends SelectionId>(
  state: SelectionState<Id>,
  orderedIds: readonly Id[],
): Id[] {
  return unique(orderedIds).filter((id) => isSelected(state, id));
}

export const getSelectionStatus = selectionStatus;
export const selectAllOnPage = selectPage;
export const selectAll = selectAllResults;
