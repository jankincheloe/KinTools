# HistoryHandler

`@jankincheloe/history-handler` provides bounded local undo/redo for
JSON-compatible data. It owns and deeply freezes snapshots, so later changes
to input objects cannot alter past states.

```ts
import { createHistory } from "@jankincheloe/history-handler";

const history = createHistory({ text: "" }, { limit: 100 });
history.set({ text: "a" }, { group: "typing" });
history.set({ text: "ab" }, { group: "typing" });
history.endGroup();
history.undo(); // text: ""
history.redo(); // text: "ab"
```

The API is `getState`, `subscribe`, `set`, `undo`, `redo`, `endGroup`, `clear`
and `reset`. State exposes `past`, `present`, `future`, `canUndo` and `canRedo`.
`set` also accepts an updater function. Consecutive edits with the same
non-undefined group form one undo step. Ungrouped edits, undo/redo and
`endGroup` end grouping. New edits discard redo history.

`limit` is a positive integer (default 100). Equal values do not create a
history step; equality defaults to JSON serialization and can be replaced
with `equals`. `clear` retains the current value while discarding history;
`reset(value)` starts a new baseline. This controls local state: undoing a
server operation requires an application-defined compensating action.

React: `useHistory(controller)` from `/react` returns `{ state, history }`.

## Installation and development

```bash
npm install @jankincheloe/history-handler
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
