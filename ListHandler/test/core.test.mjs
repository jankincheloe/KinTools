import assert from "node:assert/strict";
import test from "node:test";

import {
  clampColumnWidth,
  normalizeColumnState,
  sortItems,
  visibleColumns,
} from "../dist/core.js";

const columns = [
  { id: "name", header: "Name", sortValue: (person) => person.name },
  { id: "score", header: "Score", sortValue: (person) => person.score },
];

test("keeps column widths in safe readable bounds", () => {
  assert.equal(clampColumnWidth(columns[0], 12), 96);
  assert.equal(clampColumnWidth(columns[0], 220.6), 221);
  assert.equal(clampColumnWidth(columns[0], 2000), 960);
});

test("rejects stale ids and prevents hiding every column", () => {
  const state = normalizeColumnState(columns, {
    hiddenColumnIds: ["name", "score", "removed"],
    widths: { name: 22, removed: 300 },
  });
  assert.deepEqual(state.hiddenColumnIds, []);
  assert.deepEqual(state.widths, { name: 96 });
});

test("sorts stably and places empty values after populated values", () => {
  const people = [
    { id: "a", name: "Zoe" },
    { id: "b", name: "Ada", score: 5 },
    { id: "c", name: "Bea", score: 5 },
    { id: "d", name: "Carl", score: 2 },
  ];
  assert.deepEqual(
    sortItems(people, columns[1], "ascending").map((person) => person.id),
    ["d", "b", "c", "a"],
  );
  assert.deepEqual(
    visibleColumns(columns, ["score"]).map((column) => column.id),
    ["name"],
  );
});
