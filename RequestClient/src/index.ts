export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue | readonly QueryValue[]> | URLSearchParams;

export type RequestInput = string | URL;

export type ResponseType = "json" | "text" | "blob" | "arrayBuffer";

export type RequestMethod =
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | (string & {});

export type FetchLike = (input: RequestInput, init?: RequestInit) => Promise<Response>;

export type HeaderProvider =
  | HeadersInit
  | (() => HeadersInit | null | undefined | Promise<HeadersInit | null | undefined>);

export type AuthHeaderProvider = () => string | null | undefined | Promise<string | null | undefined>;

export type AuthRefreshProvider = () => string | void | Promise<string | void>;

export type Sleep = (milliseconds: number) => void | Promise<void>;

export type RequestErrorCode =
  | "invalid_url"
  | "invalid_request"
  | "network_error"
  | "timeout"
  | "aborted"
  | "http_error"
  | "parse_error"
  | "auth_refresh_failed"
  | (string & {});

export class RequestError extends Error {
  readonly status: number | undefined;
  readonly code: RequestErrorCode;
  readonly retryable: boolean;
  readonly requestId: string | undefined;
  readonly cause: unknown;
  readonly url: string | undefined;
  readonly method: string | undefined;
  readonly body: string | undefined;

  constructor(message: string, options: RequestErrorOptions = {}) {
    super(message);
    this.name = "RequestError";
    this.status = options.status;
    this.code = options.code ?? "request_error";
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.cause = options.cause;
    this.url = options.url;
    this.method = options.method;
    this.body = options.body;
  }
}

export type RequestErrorOptions = {
  status?: number;
  code?: RequestErrorCode;
  retryable?: boolean;
  requestId?: string;
  cause?: unknown;
  url?: string;
  method?: string;
  body?: string;
};

export type RetryOptions = {
  /** Number of retries after the initial request. Defaults to zero. */
  maxRetries?: number;
  /** Delay before the first retry in milliseconds. */
  baseDelayMs?: number;
  /** Exponential multiplier applied after each retry. */
  backoffFactor?: number;
  /** Upper bound for one backoff delay. Defaults to Infinity. */
  maxDelayMs?: number;
  /** HTTP statuses considered transient when retryOn is not supplied. */
  retryOnStatuses?: readonly number[];
  /** Optional final decision for transient errors. Method safety is always enforced. */
  retryOn?: (error: RequestError) => boolean;
};

export type AuthOptions = {
  /** Returns the complete value for the Authorization header, for example `Bearer token`. */
  getHeader: AuthHeaderProvider;
  /** Refreshes credentials and may return the complete replacement Authorization value. */
  refresh?: AuthRefreshProvider;
};

export type RequestClientOptions = {
  /** Origin or path prefix used when request inputs are relative URLs. */
  baseUrl?: string | URL;
  /** Injectable transport; defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Headers applied before auth and request-specific headers. */
  defaultHeaders?: HeaderProvider;
  /** Shorthand auth provider. `auth` takes precedence when both are supplied. */
  authHeader?: AuthHeaderProvider;
  auth?: AuthOptions;
  /** Shorthand refresh provider. `auth.refresh` takes precedence when supplied. */
  refreshAuth?: AuthRefreshProvider;
  timeoutMs?: number;
  retry?: RetryOptions | false;
  sleep?: Sleep;
  /** Response header to use for request correlation IDs. Defaults to X-Request-ID. */
  requestIdHeader?: string;
};

export type RequestOptions = {
  method?: RequestMethod;
  query?: QueryParams;
  headers?: HeadersInit;
  /** JSON-serializes this value and sets Content-Type when absent. */
  json?: unknown;
  /** A fetch-compatible body. Use `json` for plain objects. */
  body?: BodyInit | null;
  responseType?: ResponseType;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryOptions | false;
  /** Set false to omit the configured auth provider for this request. */
  auth?: boolean;
  /** Value sent using the configured request ID header. */
  requestId?: string;
  /** Additional fetch options that do not control this client's request lifecycle. */
  requestInit?: Omit<RequestInit, "method" | "headers" | "body" | "signal">;
};

export type RequestResponse<T> = {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  requestId: string | undefined;
  url: string;
  response: Response;
};

type InternalRequestOptions = RequestOptions & {
  method: string;
};

type NormalizedRetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  retryOnStatuses: readonly number[];
  retryOn?: (error: RequestError) => boolean;
};

type RequestErrorContext = Pick<RequestErrorOptions, "status" | "url" | "method" | "requestId">;

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504] as const;
const SAFE_OR_IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE", "PUT", "DELETE"]);
const DEFAULT_REQUEST_ID_HEADER = "X-Request-ID";

function isRequestError(value: unknown): value is RequestError {
  return value instanceof RequestError;
}

function makeError(message: string, options: RequestErrorOptions): RequestError {
  return new RequestError(message, options);
}

function withErrorContext(error: RequestError, context: RequestErrorContext): RequestError {
  if (
    (context.requestId === undefined || error.requestId !== undefined) &&
    (context.url === undefined || error.url !== undefined) &&
    (context.method === undefined || error.method !== undefined)
  ) return error;
  return makeError(error.message, {
    status: error.status ?? context.status,
    code: error.code,
    retryable: error.retryable,
    requestId: error.requestId ?? context.requestId,
    cause: error.cause,
    url: error.url ?? context.url,
    method: error.method ?? context.method,
    body: error.body,
  });
}

function normalizeUnknownError(
  error: unknown,
  context: RequestErrorContext,
): RequestError {
  if (isRequestError(error)) return error;
  return makeError("Request failed before a response was received.", {
    ...context,
    code: "invalid_request",
    retryable: false,
    cause: error,
  });
}

function readRequestId(headers: Headers, requestIdHeader: string): string | undefined {
  return headers.get(requestIdHeader) ?? headers.get("X-Request-ID") ?? headers.get("Request-ID") ?? undefined;
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function appendQuery(url: URL, query: QueryParams | undefined): void {
  if (!query) return;
  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) url.searchParams.append(key, value);
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== null && item !== undefined) url.searchParams.append(key, String(item));
    }
  }
}

function createUrl(input: RequestInput, baseUrl: string | URL | undefined, query: QueryParams | undefined, requestId?: string): URL {
  try {
    const url = input instanceof URL ? new URL(input.href) : new URL(input, baseUrl);
    appendQuery(url, query);
    return url;
  } catch (cause) {
    throw makeError("The request URL is invalid.", { code: "invalid_url", retryable: false, requestId, cause });
  }
}

function normalizeMethod(method: string | undefined, requestId?: string): string {
  const normalized = (method ?? "GET").toUpperCase();
  if (!/^[A-Z][A-Z0-9-]*$/.test(normalized)) {
    throw makeError(`Invalid HTTP method: ${method ?? ""}.`, { code: "invalid_request", retryable: false, requestId });
  }
  return normalized;
}

function validateTimeout(timeoutMs: number | undefined, requestId?: string): number | undefined {
  if (timeoutMs === undefined) return undefined;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw makeError("timeoutMs must be a finite, non-negative number.", {
      code: "invalid_request",
      retryable: false,
      requestId,
    });
  }
  return timeoutMs;
}

function normalizeRetry(options: RetryOptions, requestId?: string): NormalizedRetryOptions {
  const maxRetries = options.maxRetries ?? 0;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(maxRetries) || maxRetries < 0) {
    throw makeError("retry.maxRetries must be a finite, non-negative number.", {
      code: "invalid_request",
      retryable: false,
      requestId,
    });
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw makeError("retry.baseDelayMs must be a finite, non-negative number.", {
      code: "invalid_request",
      retryable: false,
      requestId,
    });
  }
  if (!Number.isFinite(backoffFactor) || backoffFactor < 1) {
    throw makeError("retry.backoffFactor must be a finite number greater than or equal to 1.", {
      code: "invalid_request",
      retryable: false,
      requestId,
    });
  }
  if (Number.isNaN(maxDelayMs) || maxDelayMs < 0) {
    throw makeError("retry.maxDelayMs must be non-negative.", { code: "invalid_request", retryable: false, requestId });
  }
  return {
    maxRetries: Math.floor(maxRetries),
    baseDelayMs,
    backoffFactor,
    maxDelayMs,
    retryOnStatuses: options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES,
    retryOn: options.retryOn,
  };
}

function isRetryableBody(body: BodyInit | null | undefined): boolean {
  return body === undefined || body === null || typeof body === "string" || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer || isArrayBufferView(body);
}

function createAbortError(
  code: "aborted" | "timeout",
  context: RequestErrorContext,
  cause?: unknown,
): RequestError {
  return makeError(code === "timeout" ? "The request timed out." : "The request was aborted.", {
    ...context,
    code,
    retryable: code === "timeout",
    cause,
  });
}

export class RequestClient {
  private readonly baseUrl: string | URL | undefined;
  private readonly fetcher: FetchLike;
  private readonly defaultHeaders: HeaderProvider | undefined;
  private readonly authHeader: AuthHeaderProvider | undefined;
  private readonly refreshAuth: AuthRefreshProvider | undefined;
  private readonly defaultTimeoutMs: number | undefined;
  private readonly defaultRetry: RetryOptions | false;
  private readonly sleep: Sleep;
  private readonly requestIdHeader: string;
  private refreshPromise: Promise<string | void> | undefined;

  constructor(options: RequestClientOptions = {}) {
    const globalFetch = globalThis.fetch;
    if (!options.fetch && typeof globalFetch !== "function") {
      throw new TypeError("RequestClient requires fetch or a runtime with globalThis.fetch.");
    }
    this.baseUrl = options.baseUrl;
    this.fetcher = options.fetch ?? globalFetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders;
    this.authHeader = options.auth?.getHeader ?? options.authHeader;
    this.refreshAuth = options.auth?.refresh ?? options.refreshAuth;
    this.defaultTimeoutMs = validateTimeout(options.timeoutMs);
    this.defaultRetry = options.retry ?? false;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    this.requestIdHeader = options.requestIdHeader ?? DEFAULT_REQUEST_ID_HEADER;
  }

  async request<T = unknown>(input: RequestInput, options?: Omit<RequestOptions, "responseType"> & { responseType?: "json" }): Promise<RequestResponse<T>>;
  async request(input: RequestInput, options: Omit<RequestOptions, "responseType"> & { responseType: "text" }): Promise<RequestResponse<string>>;
  async request(input: RequestInput, options: Omit<RequestOptions, "responseType"> & { responseType: "blob" }): Promise<RequestResponse<Blob>>;
  async request(input: RequestInput, options: Omit<RequestOptions, "responseType"> & { responseType: "arrayBuffer" }): Promise<RequestResponse<ArrayBuffer>>;
  async request<T = unknown>(input: RequestInput, options: RequestOptions = {}): Promise<RequestResponse<T>> {
    const method = normalizeMethod(options.method, options.requestId);
    const internalOptions: InternalRequestOptions = { ...options, method };
    const retry = this.resolveRetry(options.retry, options.requestId);
    const retryableBody = isRetryableBody(options.body);
    let retryCount = 0;
    let authReplayed = false;
    let authOverride: string | undefined;

    while (true) {
      let error: RequestError;
      try {
        return await this.performAttempt<T>(input, internalOptions, authOverride);
      } catch (cause) {
        const context = { method, url: typeof input === "string" ? input : input.href, requestId: options.requestId };
        error = isRequestError(cause) ? withErrorContext(cause, context) : normalizeUnknownError(cause, context);
      }

      if (error.status === 401 && !authReplayed && options.auth !== false && this.refreshAuth) {
        authReplayed = true;
        try {
          const refreshed = await this.refreshCredentials();
          authOverride = typeof refreshed === "string" ? refreshed : undefined;
        } catch (cause) {
          throw makeError("Authentication refresh failed.", {
            status: 401,
            code: "auth_refresh_failed",
            retryable: false,
            requestId: error.requestId ?? options.requestId,
            url: error.url,
            method,
            cause,
          });
        }
        continue;
      }

      if (
        retry &&
        retryCount < retry.maxRetries &&
        retryableBody &&
        this.shouldRetry(method, error, retry)
      ) {
        const delay = Math.min(retry.maxDelayMs, retry.baseDelayMs * retry.backoffFactor ** retryCount);
        await this.waitForBackoff(delay, options.signal, {
          method,
          url: error.url,
          requestId: error.requestId ?? options.requestId,
        });
        retryCount += 1;
        continue;
      }

      throw error;
    }
  }

  async requestText(input: RequestInput, options: Omit<RequestOptions, "responseType"> = {}): Promise<RequestResponse<string>> {
    return this.request(input, { ...options, responseType: "text" });
  }

  async requestBlob(input: RequestInput, options: Omit<RequestOptions, "responseType"> = {}): Promise<RequestResponse<Blob>> {
    return this.request(input, { ...options, responseType: "blob" });
  }

  async requestArrayBuffer(input: RequestInput, options: Omit<RequestOptions, "responseType"> = {}): Promise<RequestResponse<ArrayBuffer>> {
    return this.request(input, { ...options, responseType: "arrayBuffer" });
  }

  async get<T = unknown>(input: RequestInput, options: Omit<RequestOptions, "method" | "responseType"> = {}): Promise<RequestResponse<T>> {
    return this.request<T>(input, { ...options, method: "GET" });
  }

  async post<T = unknown>(input: RequestInput, json?: unknown, options: Omit<RequestOptions, "method" | "json" | "body" | "responseType"> = {}): Promise<RequestResponse<T>> {
    return this.request<T>(input, { ...options, method: "POST", json });
  }

  private resolveRetry(retry: RetryOptions | false | undefined, requestId?: string): NormalizedRetryOptions | undefined {
    const configured = retry === undefined ? this.defaultRetry : retry;
    return configured === false ? undefined : normalizeRetry(configured, requestId);
  }

  private shouldRetry(method: string, error: RequestError, retry: NormalizedRetryOptions): boolean {
    if (
      !SAFE_OR_IDEMPOTENT_METHODS.has(method) ||
      error.code === "aborted" ||
      error.code === "auth_refresh_failed" ||
      error.code === "invalid_url" ||
      error.code === "invalid_request" ||
      error.code === "parse_error"
    ) return false;
    if (retry.retryOn) return retry.retryOn(error);
    if (error.code === "network_error" || error.code === "timeout") return true;
    return error.code === "http_error" && error.status !== undefined && retry.retryOnStatuses.includes(error.status);
  }

  private async refreshCredentials(): Promise<string | void> {
    if (!this.refreshAuth) return undefined;
    if (!this.refreshPromise) {
      const pending = Promise.resolve().then(() => this.refreshAuth!());
      this.refreshPromise = pending.finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  private async waitForBackoff(delay: number, signal: AbortSignal | undefined, context: RequestErrorContext): Promise<void> {
    if (!signal) {
      await this.sleep(delay);
      return;
    }
    if (signal.aborted) throw createAbortError("aborted", context, signal.reason);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onAbort = () => finish(() => reject(createAbortError("aborted", context, signal.reason)));

      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }

      let pendingSleep: void | Promise<void>;
      try {
        pendingSleep = this.sleep(delay);
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      Promise.resolve(pendingSleep).then(
        () => finish(resolve),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private async resolveHeaders(provider: HeaderProvider | undefined): Promise<Headers> {
    if (!provider) return new Headers();
    const resolved = typeof provider === "function" ? await provider() : provider;
    return resolved == null ? new Headers() : new Headers(resolved);
  }

  private async buildHeaders(options: InternalRequestOptions, authOverride: string | undefined): Promise<Headers> {
    const headers = await this.resolveHeaders(this.defaultHeaders);
    const authEnabled = options.auth !== false;
    if (authEnabled && this.authHeader) {
      const value = await this.authHeader();
      if (value != null) headers.set("Authorization", value);
    }
    if (options.headers) {
      const requestHeaders = new Headers(options.headers);
      for (const [name, value] of requestHeaders.entries()) headers.set(name, value);
    }
    if (authEnabled && authOverride !== undefined) headers.set("Authorization", authOverride);
    if (options.requestId !== undefined) headers.set(this.requestIdHeader, options.requestId);
    if (options.json !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return headers;
  }

  private async performAttempt<T>(input: RequestInput, options: InternalRequestOptions, authOverride: string | undefined): Promise<RequestResponse<T>> {
    const url = createUrl(input, this.baseUrl, options.query, options.requestId);
    const context = { url: url.href, method: options.method, requestId: options.requestId } satisfies RequestErrorContext;
    if (options.json !== undefined && options.body !== undefined) {
      throw makeError("Use either json or body, not both.", { ...context, code: "invalid_request", retryable: false });
    }
    const timeoutMs = validateTimeout(options.timeoutMs ?? this.defaultTimeoutMs, options.requestId);
    let headers: Headers;
    try {
      headers = await this.buildHeaders(options, authOverride);
    } catch (cause) {
      if (isRequestError(cause)) throw withErrorContext(cause, context);
      throw makeError("Request headers could not be prepared.", {
        ...context,
        code: "invalid_request",
        retryable: false,
        cause,
      });
    }
    let body: BodyInit | null | undefined;
    try {
      body = options.json === undefined ? options.body : JSON.stringify(options.json);
    } catch (cause) {
      throw makeError("The JSON request body could not be serialized.", {
        ...context,
        code: "invalid_request",
        retryable: false,
        cause,
      });
    }
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);

    if (externalSignal?.aborted) throw createAbortError("aborted", context, externalSignal.reason);
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    if (timeoutMs !== undefined && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error("Request timeout"));
      }, timeoutMs);
    }

    try {
      let response: Response;
      try {
        response = await this.fetcher(url.href, {
          ...options.requestInit,
          method: options.method,
          headers,
          body,
          signal: controller.signal,
        });
      } catch (cause) {
        if (timedOut) throw createAbortError("timeout", context, cause);
        if (externalSignal?.aborted) throw createAbortError("aborted", context, externalSignal.reason ?? cause);
        throw makeError("The network request failed.", {
          ...context,
          code: "network_error",
          retryable: true,
          cause,
        });
      }

      if (timedOut) throw createAbortError("timeout", context);
      if (externalSignal?.aborted) throw createAbortError("aborted", context, externalSignal.reason);

      const requestId = readRequestId(response.headers, this.requestIdHeader) ?? context.requestId;
      if (!response.ok) {
        let responseBody: string | undefined;
        try {
          responseBody = await response.text();
        } catch {
          responseBody = undefined;
        }
        throw makeError(`Request failed with HTTP ${response.status}.`, {
          ...context,
          status: response.status,
          code: "http_error",
          retryable: DEFAULT_RETRY_STATUSES.includes(response.status as (typeof DEFAULT_RETRY_STATUSES)[number]),
          requestId,
          body: responseBody,
        });
      }

      let data: unknown;
      try {
        data = await this.parseResponse(response, options.responseType ?? "json");
      } catch (cause) {
        if (isRequestError(cause)) {
          throw withErrorContext(cause, { ...context, status: response.status, requestId });
        }
        throw makeError("The response body could not be parsed.", {
          ...context,
          status: response.status,
          code: "parse_error",
          retryable: false,
          requestId,
          cause,
        });
      }
      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        requestId,
        url: response.url || url.href,
        response,
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  private async parseResponse(response: Response, responseType: ResponseType): Promise<unknown> {
    if (responseType === "text") return response.text();
    if (responseType === "blob") return response.blob();
    if (responseType === "arrayBuffer") return response.arrayBuffer();
    if (responseType !== "json") {
      throw makeError(`Unsupported response type: ${String(responseType)}.`, {
        code: "invalid_request",
        retryable: false,
      });
    }
    const text = await response.text();
    if (text.trim() === "") return undefined;
    return JSON.parse(text) as unknown;
  }
}

export function createRequestClient(options: RequestClientOptions = {}): RequestClient {
  return new RequestClient(options);
}
