import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  selectedIdsFor,
  selectionStatus,
  toggleSelection,
} from "../dist/core.js";

test("core and root entries stay React-free", async () => {
  const [coreSource, rootSource] = await Promise.all([
    readFile(new URL("../dist/core.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/index.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(coreSource, /(?:from|require\(['"])react/);
  assert.doesNotMatch(rootSource, /(?:from|require\(['"])react/);
});

test("supports explicit single and multiple selection without mutating input", () => {
  const initial = createSelectionState({ selectedIds: ["a"] });
  const next = selectOne(initial, "b", { multiple: true });
  assert.deepEqual(initial, { mode: "explicit", selectedIds: ["a"], excludedIds: [] });
  assert.deepEqual(next.selectedIds, ["a", "b"]);
  assert.deepEqual(selectMany(next, ["c", "b"]), {
    mode: "explicit",
    selectedIds: ["c", "b"],
    excludedIds: [],
  });
  assert.deepEqual(toggleSelection(next, "a").selectedIds, ["b"]);
  assert.deepEqual(clearSelection(next).selectedIds, []);
});

test("selects pages, ranges, and reports none/some/all", () => {
  const ids = [1, 2, 3, 4];
  let state = createSelectionState();
  state = selectPage(state, [1, 2]);
  assert.equal(selectionStatus(state, [1, 2]), "all");
  assert.equal(selectionStatus(state, [2, 3]), "some");
  state = selectRange(state, ids, 2, 4);
  assert.deepEqual(state.selectedIds, [1, 2, 3, 4]);
  assert.equal(selectionStatus(state, []), "none");
});

test("supports all-results mode with exclusions and materialisation", () => {
  const all = selectAllResults(createSelectionState());
  assert.equal(all.mode, "all");
  assert.equal(isSelected(all, "fresh-id"), true);
  const withException = toggleSelection(all, "b");
  assert.equal(isSelected(withException, "b"), false);
  assert.deepEqual(selectedIdsFor(withException, ["a", "b", "c"]), ["a", "c"]);
  assert.equal(selectedCount(withException, 10), 9);
});

test("enforces maxSelection and refuses unsafe all-results selection", () => {
  const limited = selectMany(createSelectionState(), ["a", "b", "c"], { maxSelection: 2 });
  assert.deepEqual(limited.selectedIds, ["a", "b"]);
  const unchanged = selectAllResults(limited, { maxSelection: 2 });
  assert.equal(unchanged.mode, "explicit");
  const all = selectAllResults(createSelectionState(), { maxSelection: 3, totalCount: 3 });
  assert.equal(all.mode, "all");
});
