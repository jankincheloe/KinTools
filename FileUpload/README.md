# FileUpload

`@jankincheloe/file-upload` provides headless file validation, a concurrent
upload queue and per-file progress, results and errors. It has no mandatory
KinTools dependencies. A transport can accept real browser Files or typed
application file objects.

```ts
import { createFileUpload } from "@jankincheloe/file-upload";
import { createXhrUploadTransport } from "@jankincheloe/file-upload/browser";

const upload = createFileUpload({
  concurrency: 2,
  rules: { maxSize: 5_000_000, maxFiles: 10, accept: ["image/*", ".pdf"] },
  transport: createXhrUploadTransport({ url: "/api/files", timeoutMs: 30_000 }),
});
// Pass Array.from(input.files ?? []) or dropped files to upload.add(...).
const result = upload.add([] as File[]);
console.log(result.accepted, result.rejected);
```

`getState`, `subscribe`, `add`, `cancel`, `cancelAll`, `retry`, `remove`,
`pause`, `resume`, `waitForIdle` and `dispose` form the API. `add` returns
accepted IDs and rejected file/issue pairs. State contains `files`, `paused`
and `disposed`; every file has an ID, original file reference, status,
progress (0–1), loaded/total bytes, attempt count, optional result and error.
Files themselves remain caller-owned. Snapshot metadata is frozen.

Rules accept exact MIME types, MIME wildcards and filename extensions.
`maxSize` is inclusive; `maxFiles` limits the collection, including completed
files until they are removed. `validateFile` is independently available.
Issues use stable codes: `invalid_file`, `too_large`, `type_not_allowed` and
`too_many_files`. Client checks are UX checks; servers own content validation.

Statuses are `queued`, `running`, `succeeded`, `failed` and `cancelled`.
Pause affects queued files. Cancellation aborts the signal and ignores late
progress/results; its concurrency slot remains occupied until transport
settlement. Retry is explicit, available for failed/cancelled uploads only
after settlement, and restarts progress. There are no automatic upload retries.
`waitForIdle` waits for no queued or underlying active work (even if paused).
Disposal cancels all work and disconnects internal subscriptions.

A custom transport implements `upload(file, { signal, onProgress })` and
returns its result. Call `onProgress(loaded, total?)` with byte counts.
`createXhrUploadTransport` sends multipart `FormData` using POST by default;
options include PUT/PATCH, headers, field name, timeout, URL function,
response `decode` and an injectable XHR factory. Response defaults to JSON
(empty response: null). HTTP, network, timeout and parse failures reject.
XHR is created only when uploading, so importing the adapter is SSR-safe.
Chunking and resumable uploads can be implemented by another transport.

React: `useFileUpload(controller)` from `/react` returns `{ state, upload }`.
It renders no file picker or dropzone; applications supply their accessible UI.

## Installation and development

```bash
npm install @jankincheloe/file-upload
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
