# DraftHandler

`@jankincheloe/draft-handler` debounces draft writes, serializes asynchronous
saves and restores validated drafts. Its JSON-compatible values are copied
and deeply frozen; it does not depend on FormHandler or a storage package.

```ts
import { createDraftHandler } from "@jankincheloe/draft-handler";

type Draft = { text: string };
let stored: Draft | null = null;
const draft = createDraftHandler<Draft>({
  initialValue: { text: "" },
  validate: (value): value is Draft => Boolean(value && typeof value === "object"
    && "text" in value && typeof value.text === "string"),
  debounceMs: 500,
  persistence: {
    save: async (value, signal) => { if (!signal.aborted) stored = value; },
    load: async () => stored,
  },
});
draft.set({ text: "New draft" });
await draft.flush();
draft.dispose();
```

The API is `getState`, `subscribe`, `set`, `flush`, `restore` and `dispose`.
State includes `value`, `dirty`, `status`, optional `error` and `savedAt`.
Status is `idle`, `scheduled`, `saving`, `restoring`, `saved`, `error` or
`disposed`. `flush()` bypasses the debounce and returns a shared promise:
`true` means the latest revision was saved; `false` means failure/disposal.

One save runs at a time. Edits during a save are coalesced and the latest value
is saved next. An older save's failure does not suppress newer edits. Current
failures retain dirty values and can be retried with `flush`. The persistence
adapter must resolve only when its write completes.

`restore()` returns false when there is no stored draft, validation fails,
the controller is dirty/saving, or an edit supersedes the load. Loading never
overwrites newer edits. Disposal clears the timer, aborts adapter signals and
ignores late responses; call `flush` before disposal if a final save is needed.
Aborting is cooperative and does not roll back a write already accepted by a
server. Multi-client conflict detection belongs to the persistence adapter.

`scheduler` (`set(callback, delay)` and `clear(handle)`) and `now` are injectable.
React: `useDraftHandler(controller)` from `/react` returns `{ state, draft }`.

## Installation and development

```bash
npm install @jankincheloe/draft-handler
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
