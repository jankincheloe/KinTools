# ErrorToolkit

`@jankincheloe/error-toolkit` turns unknown thrown values and API-shaped
failures into a stable, typed `AppError`. The core has no runtime dependency
and is available from the package root or `./core`; React adapters are opt-in
through `./react`.

## Installation

```bash
npm install @jankincheloe/error-toolkit
```

Server, worker, and non-React code can use the package root or `/core`. Import
the optional boundary and retry adapter from `/react`.

## Core

```ts
import {
  normalizeError,
  serializeAppError,
} from "@jankincheloe/error-toolkit";

const error = normalizeError(responseError, {
  userMessage: "The profile could not be saved.",
});

console.log(error.userMessage, error.supportId);
logger.error(serializeAppError(error));
```

`message` and `technicalMessage` are diagnostic values. `userMessage` is a
separate safe display value and defaults to a generic message; API messages are
never promoted to it automatically. The result includes a stable `code`,
`severity`, `retryable`, support/correlation IDs, extracted `fieldErrors`, and
optional bounded `details` and a short cause summary.

Common API shapes are supported, including `errors: { field: message }`,
`fieldErrors`, arrays with `field`/`path`/`property` and `message`/`detail`,
JSON:API pointers, and nested `response.data` payloads.

## Security and serialization

`redactSensitive` and `serializeAppError` create bounded, circular-safe
objects. Keys containing values such as `password`, `token`, `authorization`,
`cookie`, `apiKey`, `secret`, card numbers, or SSNs are replaced with
`[REDACTED]`; pass `redactKeys` for application-specific keys. Technical
messages remain diagnostic and should be access-controlled. Details are
redacted at normalization and again at serialization.

Support and correlation IDs are preserved from common payload/header names.
When absent, `defaultIdFactory` generates them without requiring browser APIs;
pass `idFactory` for deterministic IDs in tests or host-specific IDs.

Retryability preserves an explicit `retryable` flag, then recognises transient
HTTP statuses (408, 425, 429, 5xx) and transient codes such as timeout,
network, unavailable, and abort errors. Applications can override it through
`normalizeError` options.

## Reporting

```ts
import { reportError, type ErrorReporter } from "@jankincheloe/error-toolkit";

const reporter: ErrorReporter = { report: (error) => queueForDiagnostics(error) };
const appError = reportError(thrownValue, reporter);
```

Reporting is best effort: a reporter exception is not allowed to replace the
application error. No monitoring SDK is included.

## React (optional)

```tsx
import { ErrorBoundary, Retry } from "@jankincheloe/error-toolkit/react";

<ErrorBoundary
  fallback={(error, retry) => <Retry error={error} onRetry={retry} fallback={<button>Try again</button>} />}
>
  <ProfilePage />
</ErrorBoundary>;
```

`ErrorBoundary` delegates all visible copy and styles to the caller. `Retry`
supports either a `fallback` node or a render-prop child and renders nothing
when neither is provided. React is an optional peer dependency.

For a safe FormHandler and RequestClient combination, see the
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
