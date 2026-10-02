# DataExport

`@jankincheloe/data-export` exports explicitly selected columns to CSV or JSON.
The core works in browsers and Node without runtime dependencies.

```ts
import { exportCsv, exportJson, type ExportColumn } from "@jankincheloe/data-export";

type Person = { name: string; age: number };
const columns: ExportColumn<Person>[] = [
  { key: "name", header: "Name", value: (person) => person.name },
  { key: "age", header: "Age", value: (person) => person.age },
];
const people = [{ name: "Ada", age: 36 }];
const csv = exportCsv(people, columns, { bom: true });
const json = exportJson(people, columns, { space: 2 });
```

Columns have unique nonempty keys, caller-owned headers and value accessors.
Values are strings, finite numbers, booleans, null or undefined. CSV maps
null/undefined to empty cells; JSON maps them to null. Objects and non-finite
numbers throw instead of being silently coerced. Only requested columns are
exported; input is not mutated.

CSV defaults to comma, CRLF, a header row and no BOM. Options are `delimiter`
(`,`, `;`, tab), `lineEnding` (CRLF/LF), `includeHeader`, `bom` and
`protectFormulas`. Separators, quotes and line breaks are escaped.
String cells and headers beginning with a spreadsheet formula marker
(`=`, `+`, `-`, `@`, including after whitespace) are prefixed with an apostrophe
by default. Numeric negative values remain numbers. Use `protectFormulas:
false` only when raw output is explicitly wanted. JSON values are unchanged.

`safeFilename` removes path/control characters, trims leading/trailing dots
and whitespace and prefixes reserved Windows device names. The `/browser`
entry exports `downloadExport(source, { filename, mimeType?, document?, url? })`.
It clicks a temporary download anchor, removes it, and revokes the object URL
afterward. Returned cleanup can revoke the URL earlier. Missing browser APIs
throw a clear error; imports are SSR-safe.

```ts
import { downloadExport } from "@jankincheloe/data-export/browser";
downloadExport("Name\r\nAda", { filename: "people.csv", mimeType: "text/csv;charset=utf-8" });
```

Filter or select rows before exporting. Exports are in-memory; server-side
streaming and XLSX belong to application adapters. This package has no React
entry because its functions do not manage reactive state.

## Installation and development

```bash
npm install @jankincheloe/data-export
```

Use the root or `/core` import for React-free logic.

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
