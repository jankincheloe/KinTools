import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRegistry } from "../dist/core.js";
import { createShortcutHandler, bindShortcuts } from "../dist/browser.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
test("checks availability using the same context passed to execution", async () => {
  let calls = 0;
  const commands = createCommandRegistry({ save: { label: "Save", available: (context) => context.allowed, run: (context, text) => `${context.id}:${text}` } }, () => ({ id: ++calls, allowed: true }));
  assert.deepEqual(await commands.execute("save", "text"), { status: "succeeded", result: "1:text" }); assert.equal(calls, 1);
  const denied = createCommandRegistry({ remove: { label: "Remove", available: () => false, run: () => assert.fail() } }, () => ({}));
  assert.deepEqual(await denied.execute("remove"), { status: "unavailable" });
  assert.equal(denied.available("__proto__"), false);
});
test("prevents duplicate execution and ignores results after cancellation", async () => {
  let resolve, signal; const gate = new Promise((r) => { resolve = r; });
  const commands = createCommandRegistry({ work: { label: "Work", run: (_context, _args, s) => { signal = s; return gate; } } }, () => ({}));
  const pending = commands.execute("work"); assert.deepEqual(await commands.execute("work"), { status: "busy" });
  commands.cancel("work"); resolve("late"); assert.deepEqual(await pending, { status: "cancelled" }); assert.equal(signal.aborted, true);
  assert.deepEqual(commands.getState().running, []); commands.dispose(); assert.deepEqual(await commands.execute("work"), { status: "unavailable" });
});
test("reports execution failure and treats throwing availability as unavailable", async () => {
  const commands = createCommandRegistry({ bad: { label: "Bad", run: () => { throw new Error("failed"); } }, denied: { label: "Denied", available: () => { throw new Error("policy"); }, run: () => assert.fail() } }, () => ({}));
  assert.equal((await commands.execute("bad")).status, "failed"); assert.equal(commands.available("denied"), false);
});
const event = (patch = {}) => ({ key: "s", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false, target: null, preventDefault() { this.prevented = true; }, ...patch });
test("keyboard shortcuts honor active scopes, editable fields and composition", () => {
  const calls = [];
  const handle = createShortcutHandler([{ key: "s", mod: true, run: () => calls.push("global") }, { key: "s", mod: true, scope: "dialog", run: () => calls.push("dialog") }], { getScopes: () => ["dialog"] });
  const first = event(); assert.equal(handle(first), true); assert.equal(first.prevented, true); assert.deepEqual(calls, ["dialog"]);
  assert.equal(handle(event({ target: { closest: () => ({}) } })), false);
  assert.equal(handle(event({ isComposing: true })), false); assert.equal(handle(event({ repeat: true })), false);
  assert.equal(handle(event({ ctrlKey: true, metaKey: true })), false);
});
test("shortcut errors are handled and browser binding releases its listener", async () => {
  let error; const handle = createShortcutHandler([{ key: "s", mod: true, run: async () => { throw new Error("shortcut"); } }], { onError: (value) => { error = value; } });
  handle(event()); await tick(); assert.match(error.message, /shortcut/);
  const listeners = new Set(); const stop = bindShortcuts([], { target: { addEventListener: (_type, fn) => listeners.add(fn), removeEventListener: (_type, fn) => listeners.delete(fn) } });
  assert.equal(listeners.size, 1); stop(); assert.equal(listeners.size, 0); assert.doesNotThrow(() => bindShortcuts([])());
});
