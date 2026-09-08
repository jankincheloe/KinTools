import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clampColumnWidth,
  columnBounds,
  columnWidth,
  type ListSort,
} from "./core.js";
import type { ReactListColumn } from "./types.js";
import type { ListHandlerLabels } from "./types.js";

type ResizeState = { pointerId: number; startX: number; startWidth: number };

export type TableHeaderProps<T> = {
  column: ReactListColumn<T>;
  widths: Record<string, number>;
  sort: ListSort | null;
  labels: ListHandlerLabels;
  onSort: (column: ReactListColumn<T>) => void;
  onWidthChange: (columnId: string, width: number) => void;
};

/**
 * Reusable table header cell with separate sort and resize controls.
 * It can be used independently when a project supplies its own table body.
 */
export function TableHeader<T>({
  column,
  widths,
  sort,
  labels,
  onSort,
  onWidthChange,
}: TableHeaderProps<T>) {
  const headerRef = useRef<HTMLTableCellElement>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const width = columnWidth(column, widths);
  const active = sort?.columnId === column.id;
  const isSortable = column.sortable !== false && Boolean(column.sortValue);
  const { min, max } = columnBounds(column);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: headerRef.current?.getBoundingClientRect().width ?? width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    onWidthChange(column.id, clampColumnWidth(column, resize.startWidth + event.clientX - resize.startX));
  }

  function finishResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 48 : 16;
    const nextWidth =
      event.key === "ArrowLeft"
        ? width - step
        : event.key === "ArrowRight"
          ? width + step
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : null;
    if (nextWidth === null) return;
    event.preventDefault();
    onWidthChange(column.id, clampColumnWidth(column, nextWidth));
  }

  return (
    <th
      ref={headerRef}
      className="list-handler__header"
      scope="col"
      aria-sort={active ? sort.direction : undefined}
    >
      {isSortable ? (
        <button
          type="button"
          className="list-handler__sort"
          aria-label={
            active && sort.direction === "ascending"
              ? labels.sortDescending(column.header)
              : labels.sortAscending(column.header)
          }
          onClick={() => onSort(column)}
        >
          <span>{column.header}</span>
          <span aria-hidden="true">{active ? (sort.direction === "ascending" ? "↑" : "↓") : "↕"}</span>
        </button>
      ) : (
        <span className="list-handler__header-label">{column.header}</span>
      )}
      <button
        type="button"
        className="list-handler__resize-handle"
        aria-label={labels.resizeColumn(column.header)}
        title={labels.resizeColumn(column.header)}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onKeyDown={resizeWithKeyboard}
      >
        <span className="list-handler__visually-hidden">{labels.resizeColumn(column.header)}</span>
      </button>
    </th>
  );
}
