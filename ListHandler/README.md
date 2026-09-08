# ListHandler

`@jankincheloe/list-handler` is an accessible, theme-neutral React table
handler. It deliberately contains no product-specific colors, UI kit, API,
language or data-model assumptions.

## Included

- stable client-side sorting with configurable accessors
- visible-column selection, requiring at least one column to remain visible
- pointer and keyboard column resizing (`←`, `→`, `Home`, `End`; `Shift` for
  larger steps)
- optional browser `localStorage` persistence behind a replaceable storage
  interface
- `TableHeader` as a standalone component for projects that compose their own
  table body
- neutral CSS custom properties and horizontal scrolling for narrow containers

## Install

After publishing the package, install it with your normal package manager:

```bash
npm install @jankincheloe/list-handler
```

## Usage

```tsx
import { ListHandler, type ReactListColumn } from "@jankincheloe/list-handler";
import "@jankincheloe/list-handler/styles.css";

type Person = { id: string; name: string; city: string };

const columns: ReactListColumn<Person>[] = [
  { id: "name", header: "Name", cell: (person) => person.name, sortValue: (person) => person.name },
  { id: "city", header: "City", cell: (person) => person.city, sortValue: (person) => person.city }
];

export function PeopleList({ people }: { people: Person[] }) {
  return (
    <ListHandler
      items={people}
      columns={columns}
      getRowKey={(person) => person.id}
      caption="People"
      storageKey="my-project:people-list"
    />
  );
}
```

## Storage and language

Pass `storage={null}` to disable persistence, or implement `ListStateStorage`
for server-backed preferences. All visible strings are exposed through the
`labels` property, so consumers can provide their own language.

For combinations with QueryState, pagination, selection, requests and other
KinTools packages, see the [integration guide](../docs/integration.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](../LICENSE)
