# QueryState

`@jankincheloe/query-state` synchronizes typed UI state with URL search
parameters. The core is framework-independent; the browser and React adapters
are optional conveniences. It has no runtime dependencies.

## Installation

```bash
npm install @jankincheloe/query-state
```

Import the framework-independent API from the package root or `/core`. Import
`useQueryState` explicitly from `/react` so non-React consumers do not load the
React adapter.

## Usage

```ts
import {
  createBrowserQueryState,
  defineQueryField,
  numberCodec,
  stringCodec,
} from "@jankincheloe/query-state";

const schema = {
  q: defineQueryField(stringCodec, ""),
  page: defineQueryField(numberCodec, 1),
};

const query = createBrowserQueryState(schema, { mode: "replace" });
query.set({ q: "Ada", page: 2 });
```

The schema is the source of the value types. Missing and invalid values resolve
to their field defaults. Default-valued fields are left out of the URL, while
parameters not in the schema are preserved. Scalar codecs reject duplicate
keys; `stringArrayCodec` uses repeated keys (`tag=a&tag=b`).

Built-in codecs are `stringCodec`, `numberCodec`, `booleanCodec`, and
`stringArrayCodec`. Custom codecs implement `QueryCodec<T>` with `decode` and
`encode`; `equals` can be supplied for non-primitive defaults.

## Core and React

Use `parseQuery` and `serializeQuery` for pure one-off conversions, or use
`createQueryState` with a custom adapter (`getSearch`, `setSearch`, and an
optional `subscribe`) for another router or framework. The store supports
`push` and `replace` navigation modes, `popstate` through the browser adapter,
partial updates, full replacement, reset, and subscriptions.

```tsx
import { useQueryState } from "@jankincheloe/query-state/react";

const { values, set } = useQueryState(schema);
```

The React hook uses `useSyncExternalStore` and has a stable server snapshot.
React and ReactDOM are peer dependencies only. `createBrowserQueryState` falls
back to an in-memory store when `window` is unavailable, so it is safe to call
during SSR.

For complete React and cross-package examples, see the
[integration guide](../docs/integration.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](../LICENSE)
