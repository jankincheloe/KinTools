# StorageState

`@jankincheloe/storage-state` stores validated JSON-compatible values in a
versioned envelope. Memory and browser storage adapters are replaceable;
values returned by the controller are owned, deeply frozen snapshots.

```ts
import { createStorageState, createMemoryStorage } from "@jankincheloe/storage-state";
import { createBrowserStorage } from "@jankincheloe/storage-state/browser";

type Prefs = { pageSize: number };
const adapter = createBrowserStorage({ kind: "local" });
const prefs = createStorageState<Prefs>({
  key: "app:table-preferences", version: 1, initialValue: { pageSize: 25 }, adapter,
  validate: (value): value is Prefs => Boolean(value && typeof value === "object"
    && "pageSize" in value && typeof value.pageSize === "number"
    && Number.isInteger(value.pageSize) && value.pageSize > 0),
});
prefs.set({ pageSize: 50 });
prefs.dispose();
```

The controller exposes `getState`, `subscribe`, `set`, `reset`, `reload` and
`dispose`. `set` accepts a value or updater. State includes `value`, `status`
(`ready` or `error`) and optional `error`. Storage failures return false and
retain the previous valid value. Invalid explicit values throw. Reset removes
the stored entry and restores the initial value.

An adapter implements synchronous `read(key)`, `write(key, source)` and
`remove(key)`, with optional `subscribe(listener)` reporting a key or null
(all keys). `createMemoryStorage()` is the default. Controllers sharing one
adapter synchronize in the same tab; the browser adapter also observes
native storage events from other tabs. Dispose releases its subscription.

`createBrowserStorage` supports `local` and `session` and an injected window.
It falls back to memory during SSR. Browser security/quota failures are
reported rather than hidden. Keep one adapter instance for same-tab sync.

Versions start at 1. `migrations` is keyed by destination version: migrating
1 to 3 applies `migrations[2]` then `migrations[3]`. The final value is
validated. Missing migrations, corrupt envelopes and future versions retain
the existing/default value and expose an error. Migration is written back on
the next explicit `set`. Adapters are synchronous; use DraftHandler for
asynchronous remote persistence.

React: `useStorageState(controller)` from `/react` returns `{ state, storage }`.

## Installation and development

```bash
npm install @jankincheloe/storage-state
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
