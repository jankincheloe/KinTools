import { useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import {
  columnWidth,
  normalizeColumnState,
  sortItems,
  visibleColumns,
  type ListColumnState,
  type ListSort,
} from "./core.js";
import { ColumnChooser } from "./ColumnChooser.js";
import { browserListStateStorage, type ListStateStorage } from "./storage.js";
import { TableHeader } from "./TableHeader.js";
import { defaultLabels, type ListHandlerLabels, type ReactListColumn } from "./types.js";

const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,label,[role='button'],[role='checkbox']";

export type ListHandlerProps<T> = {
  items: readonly T[];
  columns: readonly ReactListColumn<T>[];
  getRowKey: (item: T) => string;
  caption: string;
  /** Unique consumer-controlled key, required when preferences should persist. */
  storageKey?: string;
  storage?: ListStateStorage | null;
  sort?: ListSort | null;
  defaultSort?: ListSort | null;
  onSortChange?: (sort: ListSort) => void;
  onRowClick?: (item: T) => void;
  getRowLabel?: (item: T) => string;
  toolbar?: ReactNode;
  actions?: ReactNode;
  emptyContent?: ReactNode;
  showColumnChooser?: boolean;
  labels?: Partial<ListHandlerLabels>;
  className?: string;
};

/**
 * Theme-neutral data table. Styling is intentionally opt-in through
 * `@jankincheloe/list-handler/styles.css` and CSS custom properties.
 */
export function ListHandler<T>({
  items,
  columns,
  getRowKey,
  caption,
  storageKey,
  storage = browserListStateStorage,
  sort: controlledSort,
  defaultSort = null,
  onSortChange,
  onRowClick,
  getRowLabel,
  toolbar,
  actions,
  emptyContent,
  showColumnChooser = true,
  labels: customLabels,
  className,
}: ListHandlerProps<T>) {
  const labels = { ...defaultLabels, ...customLabels };
  const [columnState, setColumnState] = useState<ListColumnState>(() =>
    normalizeColumnState(columns, storageKey && storage ? storage.read(storageKey) : null),
  );
  const [internalSort, setInternalSort] = useState<ListSort | null>(defaultSort);
  const controlled = controlledSort !== undefined;
  const sort = controlled ? controlledSort : internalSort;
  const state = normalizeColumnState(columns, columnState);
  const currentColumns = visibleColumns(columns, state.hiddenColumnIds) as ReactListColumn<T>[];
  const activeSortColumn = sort
    ? currentColumns.find((column) => column.id === sort.columnId)
    : undefined;
  const displayedItems = useMemo(
    () =>
      sort && activeSortColumn
        ? sortItems(items, activeSortColumn, sort.direction)
        : [...items],
    [activeSortColumn, items, sort],
  );
  const minTableWidth = currentColumns.reduce(
    (total, column) => total + columnWidth(column, state.widths),
    0,
  );

  function updateColumnState(next: ListColumnState) {
    const normalized = normalizeColumnState(columns, next);
    setColumnState(normalized);
    if (storageKey && storage) storage.write(storageKey, normalized);
  }

  function changeSort(column: ReactListColumn<T>) {
    const next: ListSort = {
      columnId: column.id,
      direction:
        sort?.columnId === column.id && sort.direction === "ascending" ? "descending" : "ascending",
    };
    if (controlled) onSortChange?.(next);
    else setInternalSort(next);
  }

  function changeColumnVisibility(columnId: string, visible: boolean) {
    const hidden = new Set(state.hiddenColumnIds);
    if (visible) hidden.delete(columnId);
    else if (currentColumns.length > 1) hidden.add(columnId);
    updateColumnState({ ...state, hiddenColumnIds: [...hidden] });
  }

  function changeColumnWidth(columnId: string, width: number) {
    updateColumnState({ ...state, widths: { ...state.widths, [columnId]: width } });
  }

  function resetColumnWidths() {
    updateColumnState({ ...state, widths: {} });
  }

  function keyboardRowOpen(event: KeyboardEvent<HTMLTableRowElement>, item: T) {
    if (!onRowClick || event.key !== "Enter") return;
    event.preventDefault();
    onRowClick(item);
  }

  return (
    <section className={`list-handler${className ? ` ${className}` : ""}`} aria-label={caption}>
      {toolbar || actions || (showColumnChooser && columns.length > 1) ? (
        <div className="list-handler__toolbar">
          <div>{toolbar}</div>
          <div className="list-handler__actions">
            {showColumnChooser && columns.length > 1 ? (
              <ColumnChooser
                columns={columns}
                hiddenColumnIds={state.hiddenColumnIds}
                labels={labels}
                onVisibilityChange={changeColumnVisibility}
                onResetWidths={resetColumnWidths}
              />
            ) : null}
            {actions}
          </div>
        </div>
      ) : null}
      {!displayedItems.length && emptyContent ? (
        emptyContent
      ) : (
        <div className="list-handler__scroll-area">
          <table
            className="list-handler__table"
            style={{ "--list-handler-min-width": `${minTableWidth}px` } as CSSProperties}
          >
            <caption className="list-handler__visually-hidden">{caption}</caption>
            <colgroup>
              {currentColumns.map((column) => (
                <col key={column.id} style={{ width: `${columnWidth(column, state.widths)}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {currentColumns.map((column) => (
                  <TableHeader
                    key={column.id}
                    column={column}
                    widths={state.widths}
                    sort={sort}
                    labels={labels}
                    onSort={changeSort}
                    onWidthChange={changeColumnWidth}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((item) => {
                const rowLabel = getRowLabel?.(item) ?? getRowKey(item);
                return (
                  <tr
                    key={getRowKey(item)}
                    className={onRowClick ? "list-handler__row--interactive" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? labels.openRow(rowLabel) : undefined}
                    onClick={(event) => {
                      if (onRowClick && !(event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) {
                        onRowClick(item);
                      }
                    }}
                    onKeyDown={(event) => keyboardRowOpen(event, item)}
                  >
                    {currentColumns.map((column) => (
                      <td key={column.id} className={column.align === "right" ? "list-handler__align-right" : undefined}>
                        {column.cell(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
