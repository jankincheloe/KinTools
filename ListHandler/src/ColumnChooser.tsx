import type { ReactListColumn } from "./types.js";
import type { ListHandlerLabels } from "./types.js";

export type ColumnChooserProps<T> = {
  columns: readonly ReactListColumn<T>[];
  hiddenColumnIds: readonly string[];
  labels: ListHandlerLabels;
  onVisibilityChange: (columnId: string, visible: boolean) => void;
  onResetWidths: () => void;
};

/** Neutral native disclosure control for selecting visible columns. */
export function ColumnChooser<T>({
  columns,
  hiddenColumnIds,
  labels,
  onVisibilityChange,
  onResetWidths,
}: ColumnChooserProps<T>) {
  const hidden = new Set(hiddenColumnIds);
  const visibleCount = columns.length - hidden.size;

  return (
    <details className="list-handler__column-chooser">
      <summary>{labels.columns}</summary>
      <fieldset>
        <legend>{labels.visibleColumns}</legend>
        {columns.map((column) => {
          const visible = !hidden.has(column.id);
          return (
            <label key={column.id}>
              <input
                type="checkbox"
                checked={visible}
                disabled={visible && visibleCount === 1}
                onChange={(event) => onVisibilityChange(column.id, event.currentTarget.checked)}
              />
              <span>{column.header}</span>
            </label>
          );
        })}
      </fieldset>
      <button type="button" onClick={onResetWidths}>
        {labels.resetColumnWidths}
      </button>
    </details>
  );
}
