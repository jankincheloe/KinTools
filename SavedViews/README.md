# SavedViews

`@jankincheloe/saved-views` stores named, validated presets without making
assumptions about filters, columns, sorting, or a backend. Values are owned,
deeply frozen JSON-compatible snapshots.

```ts
import { createSavedViews } from "@jankincheloe/saved-views";

type View = { filter: string; columns: string[] };
const views = createSavedViews<View>({
  validate: (value): value is View => Boolean(value && typeof value === "object"
    && "filter" in value && typeof value.filter === "string"
    && "columns" in value && Array.isArray(value.columns)
    && value.columns.every((column) => typeof column === "string")),
});
const saved = views.save({ name: "My open tickets", value: { filter: "open", columns: ["name"] } });
views.rename(saved.id, "Open tickets");
views.apply(saved.id, (value) => console.log(value));
```

The controller exposes `getState`, `subscribe`, `get`, `save`, `rename`,
`remove`, `apply`, `reload`, `export` and `import`. Passing `id` to `save`
updates that view (or inserts an explicit ID). Generated ID collisions throw.
Names must be nonempty. `getState().views` contains ID, name, value, payload
version and update timestamp. `now` and `createId` are injectable.

The default storage is in memory. Supply a synchronous `{ read, write }`
adapter for persistence; it stores a JSON envelope with `schemaVersion: 1`.
Writes commit the controller state only after the adapter succeeds. Read
failures appear as `state.error`; write failures also throw. Invalid imports
are atomic. Duplicate IDs and future payload versions are rejected.

`version` defaults to 1. For older payloads, `migrate(value, fromVersion)` must
return the current version's value, which is validated again. Import replaces
the collection. Persist stable configuration rather than response totals,
cursor history or temporary row selection. Application adapters own user and
tenant scoping.

React: `useSavedViews(controller)` from `/react` returns `{ state, views }`.

## Installation and development

```bash
npm install @jankincheloe/saved-views
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
