# FilterBuilder

`@jankincheloe/filter-builder` provides a typed, headless filter tree. Text,
number, boolean and enum fields have their own operators. Nested `and`/`or`
groups can be evaluated locally or serialized for an application-owned API.

```ts
import { createFilterBuilder, type FilterSchema } from "@jankincheloe/filter-builder";

type Person = { name: string; age: number; status: "open" | "closed" };
const schema = {
  name: { type: "text", getValue: (person: Person) => person.name },
  age: { type: "number", getValue: (person: Person) => person.age },
  status: { type: "enum", options: ["open", "closed"] as const, getValue: (person: Person) => person.status },
} satisfies FilterSchema<Person>;

const filters = createFilterBuilder(schema);
filters.set({ operator: "and", children: [
  { field: "name", operator: "contains", value: "Ada" },
  { field: "age", operator: "between", value: [18, 40] },
] });
const visible = filters.filter([{ name: "Ada", age: 36, status: "open" }]);
const serialized = filters.serialize();
```

`getState`, `subscribe`, `set`, `reset`, `filter` and `serialize` form the
controller API. `validateFilter`, `parseFilter`, `serializeFilter` and
`filterItems` are also available as standalone functions.

Text supports `eq`, `ne`, `contains` and `startsWith` and is case-insensitive
unless the field sets `caseSensitive`. Numbers support `eq`, `ne`, `lt`, `lte`,
`gt`, `gte` and inclusive `between`. Booleans support `eq`/`ne`; enums support
`eq`, `ne`, `in` and `notIn`. Every field supports `empty`/`notEmpty`.
Null, undefined and empty strings match `empty` and fail ordinary comparisons.
An empty `and` group matches everything; an empty `or` group matches nothing.

Untrusted trees are checked for field names, operators, finite values, enum
membership and complexity (maximum depth 32, maximum 1,000 nodes). Invalid
input throws instead of silently dropping constraints. Getters must be pure.
No expressions are evaluated as code. Servers must independently validate and
translate serialized filters; serialization does not produce SQL.

React consumers import `useFilterBuilder` from `/react` and pass an existing
controller. The hook returns `{ state, builder }`. Use `as const` or
`satisfies FilterSchema<T>` to retain discriminated field/operator types.

## Installation and development

```bash
npm install @jankincheloe/filter-builder
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
