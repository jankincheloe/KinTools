# KinTools

Collection of small, framework-friendly tools for other projects. Every tool
lives in its own folder, has its own package metadata and can be used without
depending on another KinTools package. The repository is an npm workspace, while each package
remains independently installable and buildable.

## Available tools

- [`ListHandler`](./ListHandler) – accessible React table handling with sorting,
  column visibility, persisted column widths and a reusable table header.
- [`QueryState`](./QueryState) – typed synchronization of UI state with URL
  search parameters, with core, browser and React adapters.
- [`SelectionHandler`](./SelectionHandler) – immutable selection logic for
  tables, cards and lists, with range, page and all-results selection.
- [`FormHandler`](./FormHandler) – typed, framework-independent form state,
  field validation and submission primitives with an optional React adapter.
- [`ErrorToolkit`](./ErrorToolkit) – typed application-error normalization,
  redaction, reporting and optional React boundary/retry adapters.
- [`RequestClient`](./RequestClient) – framework-free fetch client for browser
  and modern Node runtimes with typed responses, retries and auth refresh.
- [`OverlayManager`](./OverlayManager) – headless overlay stacks with optional
  React portals, focus handling, Escape dismissal and scroll locking.
- [`PaginationHandler`](./PaginationHandler) – immutable page and cursor
  pagination with QueryState-friendly serialization and an optional React hook.
- [`PermissionEvaluator`](./PermissionEvaluator) – typed RBAC/ABAC evaluation
  with default-deny semantics and optional React guards.
- [`FilterBuilder`](./FilterBuilder) – typed filter trees, local evaluation and
  validated serialization for URLs or APIs.
- [`SavedViews`](./SavedViews) – named, versioned view presets with validation
  and replaceable persistence.
- [`DraftHandler`](./DraftHandler) – debounced draft saving, serialized writes
  and restoration that preserves newer edits.
- [`FileUpload`](./FileUpload) – validated concurrent uploads, per-file progress,
  cancellation, retry and an optional multipart XHR transport.
- [`DataExport`](./DataExport) – column-based CSV/JSON export and browser downloads.
- [`CommandRegistry`](./CommandRegistry) – typed actions with availability,
  execution state and scoped keyboard shortcuts.
- [`HistoryHandler`](./HistoryHandler) – bounded local undo/redo with grouped changes.
- [`StorageState`](./StorageState) – validated persisted state, version migrations
  and memory/browser storage adapters.
- [`TaskQueue`](./TaskQueue) – bounded asynchronous concurrency, cancellation,
  explicit retries and per-task outcomes.

## Integration

The German-language [`docs/integration.md`](./docs/integration.md) explains
published and local installation, import paths, React integration and common
combinations of the tools.

## Tool registry

Every tool has a [`tool-manifest.json`](./ListHandler/tool-manifest.json) next
to its `package.json`. The manifest contract is defined by
[`tool-manifest.schema.json`](./tool-manifest.schema.json); the conventions and
validation rules are documented in [`docs/tool-manifests.md`](./docs/tool-manifests.md).

Run the registry check from the repository root:

```bash
npm run validate:manifests
```

The root workspace also provides `npm test`, `npm run typecheck` and
`npm run build` to trigger the corresponding scripts in all existing packages.
`npm test` additionally verifies cross-package workflows, React SSR and
ESM/CommonJS imports that leave optional React peers unloaded.

## License

KinTools is available under the [MIT License](./LICENSE).
