# SelectionHandler

`@jankincheloe/selection-handler` provides immutable, product-neutral
selection state for tables, cards, and lists. The core has no runtime
dependencies; `useSelection` is a small optional React adapter.

## Installation

```bash
npm install @jankincheloe/selection-handler
```

The package root and `/core` are React-free. React applications import the
optional hook from `@jankincheloe/selection-handler/react`.

## API

`SelectionState` has two modes:

- `explicit`: `selectedIds` contains the selected IDs and `excludedIds` is empty.
- `all`: every result is selected and `excludedIds` contains the exceptions.

IDs may be strings or numbers. Every operation returns a fresh state and never
mutates an input array or state object.

```ts
import {
  createSelectionState,
  selectPage,
  selectRange,
  selectAllResults,
  selectionStatus,
  toggleSelection,
} from "@jankincheloe/selection-handler";

let state = createSelectionState<string>();
state = selectPage(state, ["a", "b"]);
state = selectRange(state, ["a", "b", "c", "d"], "b", "d");
state = selectAllResults(state);
state = toggleSelection(state, "archived-id");
selectionStatus(state, ["a", "b"]); // "all"
```

The range function uses the supplied ordered ID list, includes both endpoints,
and returns the unchanged selection when either endpoint is absent. Page
selection adds page IDs to the existing selection; `togglePageSelection` is
available when page checkboxes should toggle as a group. Duplicate IDs are
deduplicated using normal JavaScript `Set` equality.

## Maximum selection

Pass `maxSelection` to selection operations or to `useSelection`. It is a
non-negative integer limit (fractions are rounded down). Additional explicit
IDs are ignored once the limit is reached. Entering all-results mode with a
limit is allowed only when `totalCount` is supplied and does not exceed the
limit; without that proof, `selectAllResults` returns a normalised unchanged
state. This prevents an unknown result set from exceeding the limit.

## React

```tsx
import { useSelection } from "@jankincheloe/selection-handler/react";

const selection = useSelection({
  defaultValue: createSelectionState<number>(),
  maxSelection: 50,
  totalCount: peopleTotal,
  onChange: saveSelection,
});

selection.select(person.id, { multiple: true });
selection.selectPage(pageIds);
selection.selectAllResults();
```

For controlled use, pass `value` and `onChange`; omit `value` for
uncontrolled local state. No visible UI or styles are included.

For ListHandler, QueryState and PaginationHandler combinations, see the
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
