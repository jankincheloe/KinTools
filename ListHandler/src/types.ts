import type { ReactNode } from "react";

import type { ListColumn } from "./core.js";

export type ReactListColumn<T> = ListColumn<T> & {
  cell: (item: T) => ReactNode;
};

export type ListHandlerLabels = {
  columns: string;
  visibleColumns: string;
  resetColumnWidths: string;
  sortAscending: (column: string) => string;
  sortDescending: (column: string) => string;
  resizeColumn: (column: string) => string;
  openRow: (row: string) => string;
};

export const defaultLabels: ListHandlerLabels = {
  columns: "Columns",
  visibleColumns: "Visible columns",
  resetColumnWidths: "Reset column widths",
  sortAscending: (column) => `Sort ${column} ascending`,
  sortDescending: (column) => `Sort ${column} descending`,
  resizeColumn: (column) => `Resize ${column}`,
  openRow: (row) => `Open ${row}`,
};
