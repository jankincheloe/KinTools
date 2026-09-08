import assert from "node:assert/strict";
import test from "node:test";

import {
  createOverlayManager,
} from "../dist/core.js";
import {
  acquireScrollLock,
  handleEscape,
  trapFocus,
} from "../dist/dom.js";

test("keeps snapshots immutable and entries type/layer ordered", () => {
  const manager = createOverlayManager({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
  const firstSnapshot = manager.getSnapshot();
  const lower = manager.open("drawer", { value: 1 }, { layer: 1 });
  const upper = manager.open("dialog", { value: 2 }, { layer: 3, modal: true });
  const equal = manager.open("toast", { value: 3 }, { layer: 3 });

  assert.deepEqual(manager.getSnapshot().overlays.map((item) => item.id), [lower, upper, equal]);
  assert.notStrictEqual(manager.getSnapshot(), firstSnapshot);
  assert.throws(() => manager.getSnapshot().overlays.push({}), TypeError);
  assert.throws(() => manager.getSnapshot().overlays[0].layer = 99, TypeError);
});

test("closeTop never dismisses beneath an undismissible top overlay", () => {
  const manager = createOverlayManager({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
  const lower = manager.open({ type: "dialog", payload: { step: 1 }, dismissible: true });
  const upper = manager.open({ type: "dialog", payload: { step: 2 }, dismissible: false });
  assert.equal(manager.closeTop(), undefined);
  assert.equal(manager.getTop().id, upper);
  assert.equal(manager.close(upper), true);
  assert.equal(manager.closeTop(), lower);
  assert.equal(manager.getSnapshot().overlays.length, 0);
});

test("getTopModal keeps the highest active modal below a non-modal overlay", () => {
  const manager = createOverlayManager({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
  const modal = manager.open("dialog", { step: 1 }, { modal: true, layer: 1 });
  manager.open("toast", { message: "notice" }, { modal: false, layer: 2 });
  assert.equal(manager.getTop().type, "toast");
  assert.equal(manager.getTopModal().id, modal);
});

test("replace preserves the old ID by default and reorders by its new layer", () => {
  const manager = createOverlayManager({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
  const first = manager.open("a", { value: "a" }, { layer: 0 });
  const second = manager.open("b", { value: "b" }, { layer: 5 });
  assert.equal(manager.replace(first, { type: "c", payload: { value: "c" }, layer: 8 }), first);
  assert.deepEqual(manager.getSnapshot().overlays.map((item) => item.id), [second, first]);
  assert.equal(manager.replace({ type: "a", payload: { value: "new" } }), first);
  assert.equal(manager.getTop().type, "a");
});

test("Escape helper consumes only a successful top dismissal", () => {
  let closed = 0;
  const event = { key: "Escape", defaultPrevented: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  assert.equal(handleEscape(event, () => { closed += 1; return "id"; }), true);
  assert.equal(closed, 1);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(handleEscape({ key: "Escape", defaultPrevented: false, preventDefault() {}, stopPropagation() {} }, () => undefined), false);
});

test("scroll lock reference counts and restores styles", () => {
  const body = { style: { overflow: "auto", paddingRight: "4px" } };
  const documentObject = { body, defaultView: { innerWidth: 1200 }, documentElement: { clientWidth: 1180 } };
  const releaseA = acquireScrollLock(documentObject);
  const releaseB = acquireScrollLock(documentObject);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(body.style.paddingRight, "20px");
  releaseA();
  assert.equal(body.style.overflow, "hidden");
  releaseB();
  assert.equal(body.style.overflow, "auto");
  assert.equal(body.style.paddingRight, "4px");
  releaseB();
});

test("focus trap handles wrapping and a modal with no focusable children", () => {
  const first = { focus() { this.focused = true; }, getClientRects: () => [{}], hidden: false, getAttribute: () => null };
  const second = { focus() { this.focused = true; }, getClientRects: () => [{}], hidden: false, getAttribute: () => null };
  const container = {
    querySelectorAll: () => [first, second],
    ownerDocument: { activeElement: second },
    hasAttribute: () => true,
  };
  const event = { key: "Tab", shiftKey: false, preventDefault() { this.prevented = true; } };
  assert.equal(trapFocus(event, container), true);
  assert.equal(first.focused, true);
  assert.equal(event.prevented, true);
});
