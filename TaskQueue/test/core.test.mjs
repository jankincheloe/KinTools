import assert from "node:assert/strict";
import test from "node:test";
import { createTaskQueue } from "../dist/core.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
test("enforces concurrency and retains per-task results and immutable metadata", async () => {
  const queue = createTaskQueue({ concurrency: 2 }); const gates = [deferred(), deferred(), deferred()]; let active = 0, peak = 0;
  for (let i = 0; i < 3; i++) queue.add(async ({ reportProgress }) => { active++; peak = Math.max(active, peak); reportProgress(0.5); await gates[i].promise; active--; return i; }, String(i));
  await tick(); const before = queue.getState(); assert.deepEqual(before.tasks.map((task) => task.status), ["running", "running", "queued"]);
  gates[0].resolve(); await tick(); assert.equal(queue.getState().tasks[2].status, "running");
  gates[1].resolve(); gates[2].resolve(); await queue.waitForIdle(); assert.equal(peak, 2);
  assert.deepEqual(queue.getState().tasks.map((task) => task.result), [0, 1, 2]); assert.equal(before.tasks[0].status, "running");
  assert.throws(() => { before.tasks[0].progress = 9; }, TypeError);
});
test("cancellation holds its slot until the underlying task settles", async () => {
  const queue = createTaskQueue({ concurrency: 1 }); const gate = deferred(); let signal, calls = 0;
  const id = queue.add(async (context) => { signal = context.signal; await gate.promise; context.reportProgress(0.8); return "late"; });
  queue.add(() => { calls++; return "next"; }); await tick(); queue.cancel(id);
  assert.equal(signal.aborted, true); assert.equal(queue.retry(id), false); await tick(); assert.equal(calls, 0);
  gate.resolve(); await queue.waitForIdle(); assert.equal(calls, 1);
  assert.equal(queue.getState().tasks[0].status, "cancelled"); assert.equal(queue.getState().tasks[0].result, undefined);
});
test("pause, resume, queued cancellation and explicit retry work together", async () => {
  const queue = createTaskQueue({ paused: true }); let attempts = 0;
  const id = queue.add(() => { if (++attempts === 1) throw new Error("temporary"); return "ok"; });
  const removed = queue.add(() => assert.fail("cancelled task ran")); queue.cancel(removed);
  await tick(); assert.equal(attempts, 0); queue.resume(); await queue.waitForIdle();
  assert.equal(queue.getState().tasks[0].status, "failed"); assert.equal(queue.retry(id), true); await queue.waitForIdle();
  assert.equal(queue.getState().tasks[0].result, "ok"); assert.equal(queue.getState().tasks[0].attempt, 2);
  assert.equal(queue.remove(removed), true);
});
test("disposal cancels queued work and rejects new tasks", async () => {
  const queue = createTaskQueue({ paused: true }); queue.add(() => assert.fail("disposed task ran")); queue.dispose();
  await queue.waitForIdle(); assert.equal(queue.getState().tasks[0].status, "cancelled");
  assert.throws(() => queue.add(() => {}), /disposed/); assert.throws(() => createTaskQueue({ concurrency: 0 }));
  const duplicate = createTaskQueue({ paused: true }); duplicate.add(() => {}, "one"); assert.throws(() => duplicate.add(() => {}, "one")); duplicate.dispose();
});
