# TaskQueue

`@jankincheloe/task-queue` coordinates independent asynchronous tasks with
bounded concurrency and per-task outcomes. It requires no React or backend.

```ts
import { createTaskQueue } from "@jankincheloe/task-queue";

const queue = createTaskQueue<number>({ concurrency: 2 });
const id = queue.add(async ({ signal, reportProgress }) => {
  if (signal.aborted) throw new Error("Cancelled");
  reportProgress(0.5);
  return 42;
});
await queue.waitForIdle();
console.log(queue.getState().tasks.find((task) => task.id === id)?.result);
queue.dispose();
```

The API is `getState`, `subscribe`, `add`, `cancel`, `cancelAll`, `retry`,
`remove`, `pause`, `resume`, `waitForIdle` and `dispose`. `concurrency` is a
positive integer (default 3); `paused` and `createId` are optional.
`add(run, id?)` returns a nonempty unique ID. Functions receive an AbortSignal
and `reportProgress(0–1)`; finite progress is clamped to this range.

State exposes frozen `tasks` metadata with ID, status, progress, attempt,
optional result/error, plus `paused` and `disposed`. Results and errors remain
caller-owned. Status is `queued`, `running`, `succeeded`, `failed` or
`cancelled`. Synchronous throws and promise rejections become failed entries.

Cancellation is cooperative. A running cancelled task retains its slot until
the actual promise settles; late progress/results are ignored. This keeps the
real concurrency limit intact even for tasks that ignore their signal.
`retry` accepts failed/cancelled settled entries and retains the ID while
incrementing the next attempt. It returns false for running or successful
tasks. There are no automatic retries; applications decide which operations
can be repeated. `remove` only accepts terminal, settled entries.

Pause affects queued tasks; running tasks continue. `waitForIdle` waits for
no queued or active work, so a paused nonempty queue is not idle. Disposal
cancels queued/running tasks and rejects further additions. Adapters that
ignore cancellation and never settle also prevent idle completion.

React: `useTaskQueue(controller)` from `/react` returns `{ state, queue }`.

## Installation and development

```bash
npm install @jankincheloe/task-queue
```

Use the root or `/core` import for React-free logic. The `/react` entry has
React 18/19 as an optional peer dependency. Hooks observe caller-owned
controllers: create a controller once, subscribe with the hook, and dispose
it in the owner when applicable. Do not create shared mutable controllers
at module scope on a server. For hydration, initialize the server and client
with the same snapshot; connect browser persistence after hydration when its
contents differ from the server state.

Node.js 18+ is supported for the core and development; browser adapters need
the corresponding browser APIs. No design system, visible UI, language or
mandatory KinTools dependency is included. These initial APIs are experimental.

```bash
npm run typecheck
npm test
npm run build
```

See the [integration guide](../docs/integration.md) for combinations with
other KinTools packages.

## License

[MIT](./LICENSE)
