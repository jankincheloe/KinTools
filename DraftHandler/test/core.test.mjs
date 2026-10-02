import assert from "node:assert/strict";
import test from "node:test";
import { createDraftHandler } from "../dist/core.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const validate = (value) => value && typeof value === "object" && typeof value.text === "string";
function scheduler() { const tasks = new Set(); return { set: (fn) => { tasks.add(fn); return fn; }, clear: (fn) => tasks.delete(fn), fire: () => { const pending = [...tasks]; tasks.clear(); for (const fn of pending) fn(); }, get size() { return tasks.size; } }; }
test("debounces edits and saves an owned latest snapshot", async () => {
  const clock = scheduler(); const saved = [];
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: clock, persistence: { save: (value) => saved.push(value) }, now: () => 42 });
  const input = { text: "a" }; draft.set(input); input.text = "external"; draft.set({ text: "ab" });
  assert.equal(clock.size, 1); clock.fire(); await draft.flush();
  assert.deepEqual(saved, [{ text: "ab" }]); assert.equal(draft.getState().dirty, false); assert.equal(draft.getState().savedAt, 42);
  draft.dispose(); assert.equal(clock.size, 0);
});
test("serializes saves and skips intermediate changes while a save runs", async () => {
  const first = deferred(); const saved = []; let active = 0, peak = 0;
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: scheduler(), persistence: { async save(value) { active++; peak = Math.max(peak, active); saved.push(value.text); if (saved.length === 1) await first.promise; active--; } } });
  draft.set({ text: "a" }); const flushing = draft.flush(); await tick();
  draft.set({ text: "ab" }); draft.set({ text: "abc" }); assert.strictEqual(draft.flush(), flushing);
  first.resolve(); assert.equal(await flushing, true); assert.deepEqual(saved, ["a", "abc"]); assert.equal(peak, 1);
  assert.equal(draft.getState().value.text, "abc"); assert.equal(draft.getState().dirty, false); draft.dispose();
});
test("handles save failure, explicit retry and failure superseded by a new edit", async () => {
  let fail = true;
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: scheduler(), persistence: { save: () => { if (fail) throw new Error("offline"); } } });
  draft.set({ text: "a" }); assert.equal(await draft.flush(), false); assert.equal(draft.getState().status, "error");
  fail = false; assert.equal(await draft.flush(), true); draft.dispose();
  const gate = deferred(); const saved = [];
  const latest = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: scheduler(), persistence: { save(value) { saved.push(value.text); return saved.length === 1 ? gate.promise : undefined; } } });
  latest.set({ text: "old" }); const pending = latest.flush(); await tick(); latest.set({ text: "new" }); gate.reject(new Error("old failed"));
  assert.equal(await pending, true); assert.deepEqual(saved, ["old", "new"]); latest.dispose();
});
test("restore cannot overwrite edits made while loading", async () => {
  const gate = deferred(); let signal;
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: scheduler(), persistence: { save: () => {}, load: (s) => { signal = s; return gate.promise; } } });
  const restore = draft.restore(); draft.set({ text: "local" }); gate.resolve({ text: "remote" });
  assert.equal(await restore, false); assert.equal(signal.aborted, true); assert.equal(draft.getState().value.text, "local");
  assert.equal(await draft.restore(), false); draft.dispose();
});
test("validates restored data and aborts/ignores a late save on disposal", async () => {
  const gate = deferred(); let signal;
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, scheduler: scheduler(), persistence: { load: () => ({ text: 1 }), save: (_value, s) => { signal = s; return gate.promise; } } });
  assert.equal(await draft.restore(), false); assert.equal(draft.getState().status, "error");
  draft.set({ text: "pending" }); const saving = draft.flush(); await tick(); draft.dispose(); gate.resolve();
  assert.equal(await saving, false); assert.equal(signal.aborted, true); assert.equal(draft.getState().status, "disposed");
  assert.throws(() => draft.set({ text: "late" }), /disposed/);
});
