# RequestClient

`@jankincheloe/request-client` is a small, framework-free HTTP client for
browsers and modern Node runtimes. It uses the platform `fetch` API and has no
runtime dependencies. A custom fetch function makes the client straightforward
to use with mocks, service workers, or another transport adapter.

## Basic usage

```ts
import { createRequestClient } from "@jankincheloe/request-client";

const client = createRequestClient({
  baseUrl: "https://api.example.test/",
  defaultHeaders: { Accept: "application/json" },
});

const result = await client.get<{ id: string }>("/people/42", {
  query: { include: ["address", "roles"] },
});

console.log(result.data, result.status, result.requestId);
```

`query` values are encoded with `URLSearchParams`; `undefined` and `null` are
omitted, arrays become repeated keys, and existing query parameters are
retained. Relative URLs require `baseUrl`; invalid URL input produces a
`RequestError` with code `invalid_url`.

## Responses, bodies and errors

JSON is the default response format. Select other formats with
`requestText`, `requestBlob`, or `requestArrayBuffer`:

```ts
const text = await client.requestText("/health");
const file = await client.requestBlob("/files/report.pdf");
const bytes = await client.requestArrayBuffer("/files/report.bin");
const created = await client.post<{ id: string }>("/people", { name: "Ada" });
```

Each method returns `RequestResponse<T>` with `data`, `status`, `headers`, the
raw `response`, final URL, and a `requestId`. When `options.requestId` is set,
it is the fallback correlation ID for the response and all related
`RequestError`s; a server-provided response ID takes precedence.

HTTP failures, network failures, aborts, timeouts, and parse failures are
normalised as `RequestError`. Its stable fields are `status`, `code`,
`retryable`, `requestId`, and `cause`; HTTP error text is available as `body`.

## Headers and authentication

Headers are merged in this order: `defaultHeaders`, the configured auth header,
then request-specific `headers`. Later values replace earlier values
case-insensitively. An auth provider returns the complete Authorization value:

```ts
const client = createRequestClient({
  auth: {
    getHeader: () => `Bearer ${accessToken}`,
    refresh: async () => {
      accessToken = await refreshAccessToken();
      // Returning a value is optional when getHeader reads the updated token.
      return `Bearer ${accessToken}`;
    },
  },
});
```

On a 401 response, concurrent requests share one refresh promise. Each request
then gets at most one auth replay. A failed refresh becomes a non-retryable
`auth_refresh_failed` error.

## Timeout, abort and retry

`timeoutMs` creates an internal abort controller and is cleaned up after every
attempt. An external `AbortSignal` is combined with it and always wins over a
retry or backoff. Timeout errors may be retried; explicit external aborts are
never retried.

Retries are opt-in. Even when configured, only safe or idempotent methods
(`GET`, `HEAD`, `OPTIONS`, `TRACE`, `PUT`, `DELETE`) can retry. The default
transient statuses are 408, 425, 429, 500, 502, 503 and 504; network failures
and timeouts are also eligible. Backoff uses an injectable `sleep` function:

```ts
const client = createRequestClient({
  retry: { maxRetries: 2, baseDelayMs: 100, backoffFactor: 2 },
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});
```

`POST` is never retried by this v0.1 client, even if a custom `retryOn`
function would otherwise accept the error.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](../LICENSE)
