# CommandRegistry

`@jankincheloe/command-registry` defines typed actions once for buttons,
menus, shortcuts and application-rendered command palettes. Context is supplied
by the application and can include permissions, selection or form state.

```ts
import { createCommandRegistry, defineCommand } from "@jankincheloe/command-registry";

type Context = { canSave: boolean };
const registry = createCommandRegistry({
  save: defineCommand<Context, { text: string }, string>({
    label: "Save", scope: "editor",
    available: (context) => context.canSave,
    run: async (_context, args, signal) => {
      if (signal.aborted) throw new Error("Cancelled");
      return args.text;
    },
  }),
}, () => ({ canSave: true }));
const outcome = await registry.execute("save", { text: "Draft" });
if (outcome.status === "succeeded") console.log(outcome.result);
```

The API is `getState`, `subscribe`, `list`, `available`, `execute`, `cancel`
and `dispose`. Names, argument types and successful result types are retained.
`list()` exposes ID, label and optional scope. State exposes running IDs and
disposal. Availability is reevaluated at execution using the same context
snapshot passed to `run`. Throwing checks fail closed. This is UI action
availability; authoritative server permissions remain application-owned.

`execute` resolves to `succeeded` with result, `failed` with error, or
`unavailable`, `busy`, `cancelled`. A command can run only once concurrently.
Different commands can run together. Cancel/dispose abort signals and discard
late results; side effects already completed are not reversed. A cancelled
command remains busy until its underlying work settles.

The `/browser` entry exports `matchesShortcut`, `createShortcutHandler` and
`bindShortcuts`. A binding defines a `key`, exact `ctrl`/`meta`/`alt`/`shift`
modifiers, or `mod: true` for either Ctrl or Meta. `mod` replaces ctrl/meta
matching. `scope`, `available`, `allowInEditable` and `run` are optional
behavior controls (run is required). Active scopes come from `getScopes`;
the last active scope takes priority over earlier scopes and global bindings.

```ts
import { bindShortcuts } from "@jankincheloe/command-registry/browser";

const stop = bindShortcuts([
  { key: "s", mod: true, run: () => console.log("Save") },
]);
stop();
```

Shortcuts ignore composition, key repeats, handled events and editable targets
unless explicitly allowed. Only a matching available binding prevents the
default action. Async callback errors go to optional `onError`.
`bindShortcuts` returns cleanup and is a no-op during SSR. Keyboard scope is
binding policy; callers provide their current overlay/editor scopes.

React: `useCommandRegistry(controller)` from `/react` returns `{ state, registry }`.
It renders no buttons, menus or palette UI.

## Installation and development

```bash
npm install @jankincheloe/command-registry
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
