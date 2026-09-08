export type SortDirection = "ascending" | "descending";

export type ListSort = {
  columnId: string;
  direction: SortDirection;
};

export type ListColumn<T> = {
  /** Stable, data-oriented identifier. Never derive this from the translated header. */
  id: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (item: T) => string | number | Date | null | undefined;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

export type ListColumnState = {
  hiddenColumnIds: string[];
  widths: Record<string, number>;
};

export const DEFAULT_COLUMN_WIDTH = 160;
export const DEFAULT_MIN_COLUMN_WIDTH = 96;
export const DEFAULT_MAX_COLUMN_WIDTH = 960;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function columnBounds<T>(column: ListColumn<T>) {
  const min = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  const max = Math.max(min, column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH);
  return { min, max };
}

export function clampColumnWidth<T>(column: ListColumn<T>, width: number): number {
  const { min, max } = columnBounds(column);
  return Math.round(Math.max(min, Math.min(max, width)));
}

export function columnWidth<T>(column: ListColumn<T>, widths: Record<string, number>): number {
  return clampColumnWidth(column, widths[column.id] ?? column.defaultWidth ?? DEFAULT_COLUMN_WIDTH);
}

export function normalizeColumnState<T>(
  columns: readonly ListColumn<T>[],
  state: Partial<ListColumnState> | null | undefined,
): ListColumnState {
  const knownColumns = new Map(columns.map((column) => [column.id, column]));
  const hiddenColumnIds = [...new Set(state?.hiddenColumnIds ?? [])].filter((id) => knownColumns.has(id));
  const safeHiddenColumnIds = hiddenColumnIds.length < columns.length ? hiddenColumnIds : [];
  const widths = Object.fromEntries(
    Object.entries(state?.widths ?? {}).flatMap(([id, width]) => {
      const column = knownColumns.get(id);
      return column && typeof width === "number" && Number.isFinite(width)
        ? [[id, clampColumnWidth(column, width)]]
        : [];
    }),
  );
  return { hiddenColumnIds: safeHiddenColumnIds, widths };
}

export function visibleColumns<T>(
  columns: readonly ListColumn<T>[],
  hiddenColumnIds: readonly string[],
): ListColumn<T>[] {
  const hidden = new Set(hiddenColumnIds);
  return columns.filter((column) => !hidden.has(column.id));
}

function fallbackSortValue<T>(item: T, column: ListColumn<T>): string | number | Date | null {
  if (item && typeof item === "object") {
    const value = (item as Record<string, unknown>)[column.id];
    if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  }
  return null;
}

/** Sorts a copy and retains the source order for equal values. Empty values always come last. */
export function sortItems<T>(
  items: readonly T[],
  column: ListColumn<T>,
  direction: SortDirection,
): T[] {
  const factor = direction === "ascending" ? 1 : -1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftValue = column.sortValue?.(left.item) ?? fallbackSortValue(left.item, column);
      const rightValue = column.sortValue?.(right.item) ?? fallbackSortValue(right.item, column);
      const leftEmpty = leftValue === null || leftValue === undefined || leftValue === "";
      const rightEmpty = rightValue === null || rightValue === undefined || rightValue === "";
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
      if (leftEmpty && rightEmpty) return left.index - right.index;
      const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
      const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;
      const comparison =
        typeof leftComparable === "number" && typeof rightComparable === "number"
          ? leftComparable - rightComparable
          : collator.compare(String(leftComparable), String(rightComparable));
      return comparison === 0 ? left.index - right.index : comparison * factor;
    })
    .map(({ item }) => item);
}
