import assert from "node:assert/strict";
import test from "node:test";

import {
  booleanCodec,
  createQueryState,
  defineQueryField,
  numberCodec,
  parseQuery,
  serializeQuery,
  stringArrayCodec,
  stringCodec,
} from "../dist/core.js";
import { createBrowserQueryState } from "../dist/index.js";
import { createReactQueryState } from "../dist/react.js";

const schema = {
  search: defineQueryField(stringCodec, ""),
  page: defineQueryField(numberCodec, 1),
  archived: defineQueryField(booleanCodec, false),
  tags: defineQueryField(stringArrayCodec, []),
};

test("parses codecs, defaults malformed values, and ignores duplicate scalar values", () => {
  assert.deepEqual(parseQuery(schema, "?search=hello&page=3&archived=true&tags=a&tags=b"), {
    search: "hello",
    page: 3,
    archived: true,
    tags: ["a", "b"],
  });
  assert.deepEqual(parseQuery(schema, "?page=nope&archived=1&page=2"), {
    search: "",
    page: 1,
    archived: false,
    tags: [],
  });
});

test("omits defaults and retains unknown parameters", () => {
  assert.equal(
    serializeQuery(schema, { search: "", page: 1, archived: false, tags: [] }, "?external=keep&page=1"),
    "?external=keep",
  );
  assert.equal(
    serializeQuery(schema, { search: "a b", page: 2, archived: true, tags: ["x", "y"] }, "?external=keep"),
    "?external=keep&search=a+b&page=2&archived=true&tags=x&tags=y",
  );
});

test("updates through an in-memory store and supports reset", () => {
  const state = createQueryState(schema, { initialSearch: "?external=keep&page=2" });
  assert.strictEqual(state.get(), state.get(), "unchanged search strings reuse the snapshot");
  const events = [];
  state.subscribe(() => events.push(state.getSearch()));
  state.set({ search: "term" });
  assert.deepEqual(state.get(), { search: "term", page: 2, archived: false, tags: [] });
  state.reset(["search", "page"]);
  assert.equal(state.getSearch(), "?external=keep");
  assert.equal(events.length, 2);
});

test("reset does not mutate an already returned snapshot", () => {
  const state = createQueryState(schema, { initialSearch: "?search=term&page=2&tags=a&tags=b" });
  const beforeReset = state.get();
  const expectedBeforeReset = {
    search: "term",
    page: 2,
    archived: false,
    tags: ["a", "b"],
  };

  state.reset(["search", "page"]);

  assert.deepEqual(beforeReset, expectedBeforeReset);
  assert.deepEqual(state.get(), { search: "", page: 1, archived: false, tags: ["a", "b"] });
  assert.notStrictEqual(state.get(), beforeReset);
});

test("browser adapter uses push/replace and reacts to popstate", () => {
  const listeners = new Set();
  const calls = [];
  const fakeWindow = {
    location: { href: "https://example.test/items?external=yes", search: "?external=yes" },
    history: {
      pushState(_data, _unused, url) {
        calls.push("push");
        fakeWindow.location.href = String(url);
        fakeWindow.location.search = new URL(fakeWindow.location.href).search;
      },
      replaceState(_data, _unused, url) {
        calls.push("replace");
        fakeWindow.location.href = String(url);
        fakeWindow.location.search = new URL(fakeWindow.location.href).search;
      },
    },
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  const state = createBrowserQueryState(schema, { window: fakeWindow });
  let changes = 0;
  state.subscribe(() => changes++);
  state.set({ page: 2 }, { mode: "push" });
  assert.deepEqual(calls, ["push"]);
  const beforePopstate = state.get();
  fakeWindow.location.search = "?page=4";
  for (const listener of listeners) listener();
  assert.equal(state.get().page, 4);
  assert.notStrictEqual(state.get(), beforePopstate, "an external search change creates a new snapshot");
  assert.equal(changes, 2);
});

test("React adapter uses the browser-backed store by default", () => {
  const listeners = new Set();
  const calls = [];
  const fakeWindow = {
    location: { href: "https://example.test/items", search: "" },
    history: {
      pushState(_data, _unused, url) { calls.push("push"); fakeWindow.location.href = String(url); fakeWindow.location.search = new URL(fakeWindow.location.href).search; },
      replaceState(_data, _unused, url) { calls.push("replace"); fakeWindow.location.href = String(url); fakeWindow.location.search = new URL(fakeWindow.location.href).search; },
    },
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
  };
  const state = createReactQueryState(schema, { window: fakeWindow });
  state.subscribe(() => {});
  state.set({ page: 3 });
  assert.deepEqual(calls, ["replace"]);
  assert.equal(state.get().page, 3);
  assert.ok(listeners.size > 0);
});

test("browser creation is SSR-safe when no window exists", () => {
  const state = createBrowserQueryState(schema, { initialSearch: "?page=2" });
  assert.equal(state.get().page, 2);
});
