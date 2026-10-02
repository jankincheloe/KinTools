import assert from "node:assert/strict";
import test from "node:test";
import { exportCsv, exportJson, safeFilename } from "../dist/core.js";
import { downloadExport } from "../dist/browser.js";

const columns = [{ key: "name", header: "Name", value: (row) => row.name }, { key: "count", header: "Count", value: (row) => row.count }];
test("escapes CSV separators, quotes, multiline cells and preserves typed numbers", () => {
  assert.equal(exportCsv([{ name: 'Ada, "A"\nL', count: -2 }, { name: null, count: 0 }], columns), 'Name,Count\r\n"Ada, ""A""\nL",-2\r\n,0');
  assert.equal(exportCsv([{ name: "a;b", count: 1 }], columns, { delimiter: ";", bom: true, lineEnding: "\n" }), '\ufeffName;Count\n"a;b";1');
});
test("protects string formulas and headers, with explicit raw-data opt-out", () => {
  const column = [{ key: "value", header: "=HEADER", value: (value) => value }];
  assert.equal(exportCsv(["=SUM(A1)", " @cmd", "-1"], column), "'=HEADER\r\n'=SUM(A1)\r\n' @cmd\r\n'-1");
  assert.equal(exportCsv(["=RAW"], column, { protectFormulas: false, includeHeader: false }), "=RAW");
});
test("JSON export uses explicit columns and rejects unsupported values", () => {
  assert.deepEqual(JSON.parse(exportJson([{ name: "Ada", count: undefined, secret: "omit" }], columns)), [{ name: "Ada", count: null }]);
  assert.throws(() => exportCsv([{ name: {}, count: 1 }], columns)); assert.throws(() => exportJson([{ name: "a", count: Infinity }], columns));
  assert.throws(() => exportJson([], [columns[0], columns[0]]));
});
test("sanitizes paths, control characters and reserved filenames", () => {
  assert.equal(safeFilename("../bad\\file?.csv"), "_bad_file_.csv");
  assert.equal(safeFilename("CON.csv"), "_CON.csv"); assert.equal(safeFilename("..."), "export");
});
test("download creates and revokes one object URL and removes the anchor", () => {
  let clicked = 0, removed = 0, revoked = 0; const anchor = { style: {}, click: () => clicked++, remove: () => removed++ };
  const cleanup = downloadExport("data", { filename: "data.csv", document: { body: { appendChild() {} }, createElement: () => anchor }, url: { createObjectURL: () => "blob:test", revokeObjectURL: () => revoked++ } });
  assert.equal(anchor.download, "data.csv"); assert.equal(clicked, 1); assert.equal(removed, 1); cleanup(); cleanup(); assert.equal(revoked, 1);
  assert.throws(() => downloadExport("x", { filename: "x" }), /unavailable/);
});
