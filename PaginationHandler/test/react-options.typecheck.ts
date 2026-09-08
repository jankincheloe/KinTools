import { usePagination } from "../src/react.js";
import type { PagePaginationState } from "../src/core.js";

const pageState: PagePaginationState = {
  mode: "page",
  page: 1,
  pageSize: 25,
  totalItems: 100,
};

usePagination({ mode: "page", value: pageState, onChange: () => undefined });
usePagination({ mode: "page", defaultValue: pageState });
usePagination({ mode: "page", pageSize: 25, totalItems: 100 });

// @ts-expect-error A controlled value must provide onChange.
usePagination({ mode: "page", value: pageState });

// @ts-expect-error onChange without value is not a controlled hook.
usePagination({ mode: "page", onChange: () => undefined });
