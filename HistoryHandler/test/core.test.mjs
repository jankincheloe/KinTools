import assert from "node:assert/strict";
import test from "node:test";
import { createHistory } from "../dist/core.js";

test("undo/redo restores owned snapshots and new edits drop redo", () => {
  const initial = { text: "" }; const history = createHistory(initial); initial.text = "external";
  history.set({ text: "a" }); history.set({ text: "b" });
  const before = history.getState(); history.undo(); assert.equal(history.getState().present.text, "a");
  history.redo(); assert.equal(history.getState().present.text, "b");
  history.undo(); history.set({ text: "c" }); assert.equal(history.getState().canRedo, false);
  assert.equal(before.present.text, "b"); assert.throws(() => { before.past[0].text = "mutated"; }, TypeError);
});
test("groups typing into one step and respects explicit group boundaries", () => {
  const h = createHistory(""); h.set("a", { group: "typing" }); h.set("ab", { group: "typing" });
  h.endGroup(); h.set("abc", { group: "typing" }); h.undo(); assert.equal(h.getState().present, "ab");
  h.undo(); assert.equal(h.getState().present, ""); h.redo(); assert.equal(h.getState().present, "ab");
});
test("bounds history, ignores equal values and resets the baseline", () => {
  const h = createHistory(0, { limit: 2 }); h.set(1); h.set(2); h.set(3); h.set(3);
  assert.deepEqual(h.getState().past, [1, 2]); h.undo(); h.undo(); h.undo(); assert.equal(h.getState().present, 1);
  h.clear(); assert.equal(h.getState().canRedo, false); h.reset(8); assert.equal(h.getState().present, 8);
  assert.throws(() => createHistory(0, { limit: 0 })); assert.throws(() => h.set({ value: NaN }));
});
