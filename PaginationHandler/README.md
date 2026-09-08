# PaginationHandler

`@jankincheloe/pagination-handler` is a headless, immutable pagination core
for lists and tables. It has no UI, styles, labels, browser dependency or
backend dependency. Page/size pagination and cursor pagination are separate
TypeScript variants, and React is an optional adapter.

## Install

```bash
npm install @jankincheloe/pagination-handler
```

The core entry point can be used without React:

```ts
import {
  createPagination,
  getPaginationInfo,
} from "@jankincheloe/pagination-handler/core";

const pagination = createPagination({
  mode: "page",
  page: 1,
  pageSize: 25,
  totalItems: 137,
});

pagination.next();
const { page, pageSize } = pagination.getState();
const { totalPages, range, canPrevious, canNext } = getPaginationInfo(pagination.getState());
```

Every update returns a new state and leaves the previous snapshot untouched.
`subscribe` is available when the controller is used as an external store.
For reducer-style state management, use `paginationReducer` and
`createPaginationState` directly.

## Page and cursor modes

The `mode` discriminant keeps the APIs honest:

```ts
const pages = createPagination({ mode: "page", pageSize: 20, totalItems: 84 });
pages.first();
pages.previous();
pages.next();
pages.last(); // only moves when totalItems is known

const cursors = createPagination({
  mode: "cursor",
  pageSize: 20,
  hasNext: true,
  nextCursor: "eyJvZmZzZXQiOjIwfQ",
});

// The response supplies the next cursor for the next request.
cursors.next();
cursors.next({ cursor: "next-cursor", hasNext: false });
cursors.previous(); // returns to the previous cursor from immutable history
cursors.first();
```

Cursor history is stored oldest-first. A cursor response can update its
metadata without changing history with `setCursorPage(options)`. `last()` is
available in cursor mode when `lastCursor` (or an explicit cursor option) is
provided; there is no fabricated last page when the server cannot provide one.

`getPaginationInfo` returns `totalPages` (undefined for unknown totals),
`range.start`/`range.end` (one-based; `{0, 0}` for an empty page), and the
`canPrevious`, `canNext`, `canFirst` and `canLast` flags. For unknown totals,
`itemCount` or explicit `hasNext` should be supplied. Without `itemCount`, the
range assumes a full page.

## Page-size changes

The default strategy is `"preserve-first-item"`: changing from size 10 on page
3 to size 25 selects the page containing the previously visible first item.
Use `"reset"` or a function for a different policy:

```ts
pagination.setPageSize(50, "reset");
pagination.setPageSize(50, ({ page, nextPageSize, totalItems }) => {
  // Return a one-based page number. The result is normalized and clamped.
  return totalItems && nextPageSize > 0 ? Math.ceil((page * 10) / nextPageSize) : 1;
});
```

For cursor mode a size change clears the cursor and history because a cursor
from the old window is not safely reusable.

## React (optional)

React is an optional peer dependency. The hook renders no markup and supports
both uncontrolled (`defaultValue` or mode fields) and controlled usage:

```tsx
import { usePagination } from "@jankincheloe/pagination-handler/react";

function PeopleList({ totalItems }: { totalItems: number }) {
  const pagination = usePagination({ mode: "page", defaultValue: { mode: "page", pageSize: 25, totalItems } });
  // Pass pagination.state.page and pagination.state.pageSize to ListHandler or
  // your data loader; render your own buttons and labels.
  return <button disabled={!pagination.info.canNext} onClick={pagination.next}>Next</button>;
}
```

Controlled usage keeps the source of truth in the parent:

```tsx
const [value, setValue] = useState<PaginationState>({
  mode: "page", page: 1, pageSize: 25, totalItems: 100,
});
const pagination = usePagination({ mode: "page", value, onChange: setValue });
```

## QueryState and ListHandler integration

The package has no runtime dependency on QueryState. The helpers exchange only
serializable primitives, so a QueryState schema can own the URL state while a
ListHandler (or any list renderer) consumes the current page:

```tsx
import { defineQueryField, numberCodec, createBrowserQueryState } from "@jankincheloe/query-state";
import {
  createPaginationState,
  paginationFromQueryValues,
  paginationToQueryValues,
} from "@jankincheloe/pagination-handler";

// Browser adapter keeps the state in the URL and reacts to back/forward.
const query = createBrowserQueryState({
  page: defineQueryField(numberCodec, 1),
  pageSize: defineQueryField(numberCodec, 25),
});

// In a component/effect, map URL values into the page core.
const current = createPaginationState({
  ...paginationFromQueryValues("page", query.get()),
  totalItems: 137,
});

// After a pagination action, persist only serializable values. QueryState
// retains unrelated query parameters and omits defaults as usual.
query.set(paginationToQueryValues(current));
```

For cursor APIs, add a string field and use
`paginationFromQueryValues("cursor", query.get())`. The helper intentionally
does not serialize totals, response metadata or cursor history.

For a complete ListHandler, QueryState and SelectionHandler combination, see
the [integration guide](../docs/integration.md).

## Development

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

The test suite covers empty data, normalization/clamping, unknown totals,
page-size strategies, cursor history, immutable snapshots, controller updates
and serializable query helpers.

## License

[MIT](../LICENSE)
