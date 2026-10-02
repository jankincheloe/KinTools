import assert from "node:assert/strict";
import test from "node:test";
import { createStorageState, createMemoryStorage } from "../dist/core.js";
import { createBrowserStorage } from "../dist/browser.js";

const validate = (v) => v && typeof v === "object" && typeof v.count === "number";
const options = (adapter) => ({ key: "prefs", initialValue: { count: 0 }, validate, adapter });
test("persists values and synchronizes controllers sharing an adapter", () => {
  const adapter = createMemoryStorage(); const a = createStorageState(options(adapter)); const b = createStorageState(options(adapter));
  const before = a.getState(); a.set({ count: 2 }); assert.equal(b.getState().value.count, 2);
  b.set((value) => ({ count: value.count + 1 })); assert.equal(a.getState().value.count, 3);
  assert.equal(before.value.count, 0); a.reset(); assert.equal(b.getState().value.count, 0);
  b.dispose(); a.set({ count: 4 }); assert.equal(b.getState().value.count, 0);
  assert.throws(() => b.set({ count: 9 }), /disposed/);
});
test("applies every migration and validates the final value", () => {
  const adapter = createMemoryStorage({ prefs: JSON.stringify({ version: 1, value: 7 }) });
  const storage = createStorageState({ ...options(adapter), version: 3, migrations: { 2: (value) => ({ old: value }), 3: (value) => ({ count: value.old }) } });
  assert.equal(storage.getState().value.count, 7); storage.set({ count: 8 }); assert.equal(JSON.parse(adapter.read("prefs")).version, 3);
  const missing = createStorageState({ ...options(adapter), version: 4 }); assert.equal(missing.getState().status, "error");
});
test("corrupt/future envelopes and quota failures preserve the current value", () => {
  let raw = JSON.stringify({ version: 1, value: { count: 5 } });
  const adapter = { read: () => raw, write: () => { throw new Error("quota"); }, remove: () => { throw new Error("blocked"); } };
  const storage = createStorageState(options(adapter)); raw = JSON.stringify({ version: 99, value: { count: 9 } });
  assert.equal(storage.reload(), false); assert.equal(storage.getState().value.count, 5);
  raw = "broken"; assert.equal(storage.reload(), false); assert.equal(storage.set({ count: 8 }), false);
  assert.equal(storage.getState().value.count, 5); assert.equal(storage.reset(), false);
  assert.throws(() => storage.set({ count: "bad" }));
});
test("browser adapter is SSR safe and releases storage listeners", () => {
  const memory = createBrowserStorage(); memory.write("x", "1"); assert.equal(memory.read("x"), "1");
  const values = new Map(); const listeners = new Set();
  const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const fakeWindow = { localStorage, sessionStorage: localStorage, addEventListener: (_type, fn) => listeners.add(fn), removeEventListener: (_type, fn) => listeners.delete(fn) };
  const adapter = createBrowserStorage({ window: fakeWindow }); const events = [];
  const stop = adapter.subscribe((key) => events.push(key)); adapter.write("x", "2");
  for (const listener of listeners) listener({ key: null, storageArea: localStorage });
  assert.deepEqual(events, ["x", null]); stop(); assert.equal(listeners.size, 0);
});
