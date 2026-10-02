import { createStore } from "./internal.js";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type TaskContext = { signal: AbortSignal; reportProgress: (progress: number) => void };
export type TaskFunction<R> = (context: TaskContext) => R | Promise<R>;
export type TaskEntry<R> = { readonly id: string; readonly status: TaskStatus; readonly progress: number; readonly attempt: number; readonly result?: R; readonly error?: unknown };
export type TaskQueueState<R> = { readonly tasks: readonly TaskEntry<R>[]; readonly paused: boolean; readonly disposed: boolean };
export function createTaskQueue<R = unknown>(options: { concurrency?: number; paused?: boolean; createId?: () => string } = {}) {
  const concurrency = options.concurrency ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("Concurrency must be a positive integer");
  const store = createStore<TaskQueueState<R>>({ tasks: Object.freeze([]), paused: options.paused ?? false, disposed: false });
  const functions = new Map<string, TaskFunction<R>>();
  const active = new Map<string, AbortController>();
  const waiters = new Set<() => void>();
  let sequence = 0;
  let scheduling = false;
  const entry = (id: string) => store.getState().tasks.find((task) => task.id === id);
  const update = (id: string, patch: Partial<TaskEntry<R>>) => store.set({ ...store.getState(), tasks: Object.freeze(store.getState().tasks.map((task) => task.id === id ? Object.freeze({ ...task, ...patch }) : task)) });
  const idle = () => active.size === 0 && !store.getState().tasks.some((task) => task.status === "queued");
  const resolveIdle = () => { if (idle()) { for (const resolve of waiters) resolve(); waiters.clear(); } };
  const schedule = () => {
    if (scheduling) return;
    scheduling = true;
    try {
      while (!store.getState().paused && !store.getState().disposed && active.size < concurrency) {
        const next = store.getState().tasks.find((task) => task.status === "queued");
        if (!next) break;
        const controller = new AbortController(); active.set(next.id, controller);
        update(next.id, { status: "running", attempt: next.attempt + 1, error: undefined, result: undefined });
        const context: TaskContext = { signal: controller.signal, reportProgress: (progress) => {
          if (!controller.signal.aborted && entry(next.id)?.status === "running" && Number.isFinite(progress)) update(next.id, { progress: Math.max(0, Math.min(1, progress)) });
        } };
        Promise.resolve().then(() => { if (controller.signal.aborted) throw new Error("Task cancelled"); return functions.get(next.id)!(context); }).then(
          (result) => { if (!controller.signal.aborted) update(next.id, { status: "succeeded", progress: 1, result }); },
          (error) => { if (!controller.signal.aborted) update(next.id, { status: "failed", error }); },
        ).finally(() => { active.delete(next.id); schedule(); resolveIdle(); });
      }
    } finally { scheduling = false; resolveIdle(); }
  };
  const assertLive = () => { if (store.getState().disposed) throw new Error("TaskQueue is disposed"); };
  const cancel = (id: string) => {
    const task = entry(id);
    if (!task || (task.status !== "queued" && task.status !== "running")) return false;
    active.get(id)?.abort(); update(id, { status: "cancelled" }); resolveIdle(); return true;
  };
  return {
    getState: store.getState, subscribe: store.subscribe,
    add(run: TaskFunction<R>, id = options.createId?.() ?? `task-${++sequence}`) {
      assertLive(); if (!id || functions.has(id)) throw new TypeError("Task IDs must be nonempty and unique");
      functions.set(id, run);
      store.set({ ...store.getState(), tasks: Object.freeze([...store.getState().tasks, Object.freeze({ id, status: "queued" as const, progress: 0, attempt: 0 })]) });
      schedule(); return id;
    },
    cancel,
    cancelAll() { for (const task of store.getState().tasks) cancel(task.id); },
    retry(id: string) {
      assertLive(); const task = entry(id);
      if (!task || active.has(id) || (task.status !== "failed" && task.status !== "cancelled")) return false;
      update(id, { status: "queued", progress: 0, error: undefined, result: undefined }); schedule(); return true;
    },
    pause() { assertLive(); store.set({ ...store.getState(), paused: true }); },
    resume() { assertLive(); store.set({ ...store.getState(), paused: false }); schedule(); },
    remove(id: string) {
      assertLive(); const task = entry(id);
      if (!task || active.has(id) || task.status === "queued") return false;
      functions.delete(id); store.set({ ...store.getState(), tasks: Object.freeze(store.getState().tasks.filter((task) => task.id !== id)) }); return true;
    },
    waitForIdle: () => idle() ? Promise.resolve() : new Promise<void>((resolve) => waiters.add(resolve)),
    dispose() { if (store.getState().disposed) return; store.set({ ...store.getState(), disposed: true }); for (const task of store.getState().tasks) cancel(task.id); resolveIdle(); },
  };
}
