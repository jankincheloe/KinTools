export type ExportValue = string | number | boolean | null | undefined;
export type ExportColumn<T> = { key: string; header: string; value: (item: T) => ExportValue };
export type CsvOptions = { delimiter?: "," | ";" | "\t"; lineEnding?: "\r\n" | "\n"; bom?: boolean; includeHeader?: boolean; protectFormulas?: boolean };
function checkColumns<T>(columns: readonly ExportColumn<T>[]) {
  const keys = new Set<string>();
  for (const column of columns) { if (!column.key || keys.has(column.key)) throw new TypeError("Export column keys must be nonempty and unique"); keys.add(column.key); }
}
function cell(value: ExportValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Non-finite export number");
  if (!["string", "number", "boolean"].includes(typeof value)) throw new TypeError("Unsupported export value");
  return String(value);
}
export function exportCsv<T>(items: readonly T[], columns: readonly ExportColumn<T>[], options: CsvOptions = {}): string {
  checkColumns(columns);
  const delimiter = options.delimiter ?? ",";
  const lineEnding = options.lineEnding ?? "\r\n";
  if (![",", ";", "\t"].includes(delimiter) || !["\r\n", "\n"].includes(lineEnding)) throw new TypeError("Invalid CSV format");
  const encode = (value: ExportValue): string => {
    let text = cell(value);
    // Spreadsheet apps can interpret string cells as formulas, including headers.
    if (options.protectFormulas !== false && typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = "'" + text;
    if (text.includes(delimiter) || /["\r\n]/u.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  };
  const rows = items.map((item) => columns.map((column) => encode(column.value(item))).join(delimiter));
  if (options.includeHeader !== false) rows.unshift(columns.map((column) => encode(column.header)).join(delimiter));
  return (options.bom ? "\ufeff" : "") + rows.join(lineEnding);
}
export function exportJson<T>(items: readonly T[], columns: readonly ExportColumn<T>[], options: { space?: number } = {}): string {
  checkColumns(columns);
  return JSON.stringify(items.map((item) => Object.fromEntries(columns.map((column) => {
    const value = column.value(item); cell(value);
    return [column.key, value ?? null];
  }))), null, options.space);
}
export function safeFilename(name: string, fallback = "export"): string {
  const clean = (input: string) => input.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 200);
  let result = clean(name) || clean(fallback) || "export";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = "_" + result;
  return result;
}
