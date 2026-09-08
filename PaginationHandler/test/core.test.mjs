import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPagination,
  createPaginationState,
  fromQueryValues,
  getPaginationInfo,
  normalizePaginationState,
  paginationReducer,
  paginationToQueryValues,
} from "../dist/core.js";

test("core and root entries stay React-free", async () => {
  const [coreSource, rootSource] = await Promise.all([
    readFile(new URL("../dist/core.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/index.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(coreSource, /(?:from|require\(['"])react/);
  assert.doesNotMatch(rootSource, /(?:from|require\(['"])react/);
});

test("empty page data has a safe range and no navigation", () => {
  const state = createPaginationState({ mode: "page", page: 99, pageSize: 20, totalItems: 0, itemCount: 0 });
  assert.equal(state.page, 1, "empty totals clamp to the only safe page");
  const info = getPaginationInfo(state);
  assert.equal(info.totalPages, 0);
  assert.deepEqual(info.range, { start: 0, end: 0 });
  assert.equal(info.canNext, false);
  const clamped = paginationReducer(state, { type: "set-total-items", totalItems: 0 });
  assert.equal(clamped.page, 1);
});

test("invalid values are normalized and known page counts clamp navigation", () => {
  const state = normalizePaginationState({ mode: "page", page: -2, pageSize: 0, totalItems: 31 });
  assert.deepEqual(state, { mode: "page", page: 1, pageSize: 25, totalItems: 31, itemCount: undefined, hasNext: undefined });
  const last = paginationReducer(state, { type: "last" });
  assert.equal(last.page, 2);
  assert.equal(getPaginationInfo(last).canNext, false);
});

test("unknown totals use item count or explicit hasNext", () => {
  const first = createPaginationState({ mode: "page", pageSize: 10, itemCount: 10 });
  assert.equal(getPaginationInfo(first).totalPages, undefined);
  assert.equal(getPaginationInfo(first).canNext, true);
  const short = createPaginationState({ mode: "page", pageSize: 10, itemCount: 3 });
  assert.equal(getPaginationInfo(short).canNext, false);
  const explicit = createPaginationState({ mode: "page", pageSize: 10, itemCount: 3, hasNext: true });
  assert.equal(getPaginationInfo(explicit).canNext, true);
});

test("page-size change can preserve first visible item or reset", () => {
  const state = createPaginationState({ mode: "page", page: 3, pageSize: 10, totalItems: 100 });
  const preserved = paginationReducer(state, { type: "set-page-size", pageSize: 25 });
  assert.equal(preserved.page, 1, "item 21 is on the first page at size 25");
  const reset = paginationReducer(state, { type: "set-page-size", pageSize: 25, strategy: "reset" });
  assert.equal(reset.page, 1);
  const custom = paginationReducer(state, {
    type: "set-page-size",
    pageSize: 25,
    strategy: ({ page }) => page + 2,
  });
  assert.equal(custom.page, 4, "custom strategies are clamped to known totals");
});

test("cursor next/previous uses immutable history", () => {
  const initial = createPaginationState({ mode: "cursor", cursor: null, pageSize: 2, hasNext: true, nextCursor: "a" });
  const pageA = paginationReducer(initial, { type: "next" });
  const pageB = paginationReducer(pageA, { type: "next", options: { cursor: "b", hasNext: false } });
  assert.deepEqual(initial.history, []);
  assert.deepEqual(pageA.history, [null]);
  assert.deepEqual(pageB.history, [null, "a"]);
  const back = paginationReducer(pageB, { type: "previous" });
  assert.equal(back.cursor, "a");
  assert.deepEqual(back.history, [null]);
  assert.equal(getPaginationInfo(back).canPrevious, true);
  const first = paginationReducer(back, { type: "previous" });
  assert.equal(first.cursor, null, "null is a valid first cursor in history");
  assert.deepEqual(first.history, []);
});

test("controller publishes only changed immutable snapshots", () => {
  const controller = createPagination({ mode: "page", page: 1, pageSize: 10, totalItems: 25 });
  const before = controller.getState();
  let changes = 0;
  let observedPage;
  controller.subscribe(() => {
    changes++;
    observedPage = controller.getState().page;
  });
  controller.previous();
  assert.equal(changes, 0);
  controller.next();
  assert.equal(changes, 1);
  assert.equal(observedPage, 2, "listeners observe the committed snapshot");
  assert.equal(before.page, 1);
  assert.equal(controller.getState().page, 2);
});

test("query helpers expose only serializable navigation values", () => {
  const page = createPaginationState({ mode: "page", page: 2, pageSize: 50, totalItems: 100 });
  assert.deepEqual(paginationToQueryValues(page), { mode: "page", page: 2, pageSize: 50 });
  assert.deepEqual(fromQueryValues("cursor", { cursor: "abc", pageSize: 10 }), {
    mode: "cursor",
    cursor: "abc",
    pageSize: 10,
  });
});
