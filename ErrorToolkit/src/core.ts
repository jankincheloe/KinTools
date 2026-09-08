export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type AppErrorCause = {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly status?: number;
};

/** A stable, serialisable shape for errors crossing application boundaries. */
export type AppError = {
  readonly name: "AppError";
  readonly code: string;
  /** Technical message for logs and diagnostics. Do not display by default. */
  readonly message: string;
  readonly technicalMessage: string;
  /** Deliberately generic unless a caller explicitly supplies a safe message. */
  readonly userMessage: string;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly supportId: string;
  readonly correlationId: string;
  readonly status?: number;
  readonly fieldErrors: FieldErrors;
  readonly details?: unknown;
  readonly cause?: AppErrorCause;
};

export type IdFactory = () => string;

export type NormalizeErrorOptions = {
  code?: string;
  userMessage?: string;
  severity?: ErrorSeverity;
  retryable?: boolean;
  supportId?: string;
  correlationId?: string;
  idFactory?: IdFactory;
  details?: unknown;
  fieldErrors?: FieldErrors;
  redactKeys?: readonly string[];
};

export type RedactionOptions = {
  /** Additional case-insensitive key fragments to redact. */
  redactKeys?: readonly string[];
  replacement?: string;
  maxDepth?: number;
  maxKeys?: number;
};

export interface ErrorReporter {
  report(error: AppError): void | Promise<void>;
}

const DEFAULT_USER_MESSAGE = "Something went wrong. Please try again.";
const REDACTED = "[REDACTED]";
const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "api-key",
  "accesskey",
  "access_token",
  "refresh_token",
  "clientsecret",
  "creditcard",
  "cardnumber",
  "cvv",
  "ssn",
];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509]);
const RETRYABLE_CODES = /(?:TIMEOUT|TIMED[_ -]?OUT|NETWORK|UNAVAILABLE|TRANSIENT|TOO[_ -]?MANY)/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstNestedValue(input: unknown, keys: readonly string[]): unknown {
  const queue: unknown[] = [input];
  const seen = new WeakSet<object>();
  for (let index = 0; index < queue.length && index < 32; index += 1) {
    const current = queue[index];
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      if (key in current && current[key] !== undefined && current[key] !== null) return current[key];
    }
    for (const key of ["response", "data", "error", "payload", "body", "result"]) {
      if (isRecord(current[key])) queue.push(current[key]);
    }
  }
  return undefined;
}

function nestedString(input: unknown, keys: readonly string[]): string | undefined {
  return stringValue(firstNestedValue(input, keys));
}

function extractStatus(input: unknown): number | undefined {
  const queue: unknown[] = [input];
  const seen = new WeakSet<object>();
  for (let index = 0; index < queue.length && index < 32; index += 1) {
    const current = queue[index];
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    const status = finiteNumber(current.status) ?? finiteNumber(current.statusCode);
    if (status !== undefined) return status;
    for (const key of ["response", "data", "error", "payload", "body", "result"]) {
      if (isRecord(current[key])) queue.push(current[key]);
    }
  }
  return undefined;
}

function extractId(input: unknown, keys: readonly string[]): string | undefined {
  const direct = nestedString(input, keys);
  if (direct) return direct;
  const headers = firstNestedValue(input, ["headers"]);
  if (!isRecord(headers)) return undefined;
  const getHeader = headers.get;
  if (typeof getHeader === "function") {
    for (const key of keys) {
      try {
        const value = getHeader.call(headers, key);
        const result = stringValue(value);
        if (result) return result;
      } catch {
        // A malformed Headers-like object must not prevent normalisation.
      }
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
      return stringValue(value);
    }
  }
  return undefined;
}

function fieldNameFromSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("/")) return value.split("/").filter(Boolean).pop();
  return value;
}

function addFieldError(target: Map<string, string[]>, field: unknown, message: unknown): void {
  const name = fieldNameFromSource(field);
  if (!name) return;
  const messages = Array.isArray(message) ? message : [message];
  for (const item of messages) {
    if (typeof item === "string" && item.trim()) {
      const current = target.get(name) ?? [];
      if (!current.includes(item)) current.push(item);
      target.set(name, current);
    } else if (isRecord(item)) {
      addFieldError(target, name, item.message ?? item.detail ?? item.title);
    }
  }
}

function collectFieldErrors(value: unknown, target: Map<string, string[]>): void {
  if (isRecord(value) && !Array.isArray(value)) {
    for (const [field, messages] of Object.entries(value)) addFieldError(target, field, messages);
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const source = isRecord(item.source) ? item.source.pointer ?? item.source.parameter : undefined;
    addFieldError(target, item.field ?? item.path ?? item.property ?? source, item.message ?? item.detail ?? item.title);
  }
}

/** Extracts common `{ errors: { field: message } }` and array API formats. */
export function extractFieldErrors(input: unknown): FieldErrors {
  const result = new Map<string, string[]>();
  const queue: unknown[] = [input];
  const seen = new WeakSet<object>();
  for (let index = 0; index < queue.length && index < 64; index += 1) {
    const current = queue[index];
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    if (current.fieldErrors !== undefined) collectFieldErrors(current.fieldErrors, result);
    if (current.errors !== undefined) collectFieldErrors(current.errors, result);
    if (current.inner !== undefined) collectFieldErrors(current.inner, result);
    for (const key of ["response", "data", "error", "payload", "body", "result"]) {
      if (isRecord(current[key])) queue.push(current[key]);
    }
  }
  return Object.fromEntries([...result.entries()].map(([field, messages]) => [field, [...messages]]));
}

function causeSummary(input: unknown): AppErrorCause | undefined {
  if (!isRecord(input)) return undefined;
  const cause = input.cause;
  if (cause === undefined || cause === null || cause === input) return undefined;
  if (cause instanceof Error) {
    return {
      name: cause.name || "Error",
      message: cause.message || "Unknown cause",
      ...(stringValue((cause as Error & { code?: unknown }).code) ? { code: String((cause as Error & { code?: unknown }).code) } : {}),
    };
  }
  if (isRecord(cause)) {
    return {
      name: stringValue(cause.name) ?? "Error",
      message: stringValue(cause.message) ?? "Unknown cause",
      ...(stringValue(cause.code) ? { code: String(cause.code) } : {}),
      ...(finiteNumber(cause.status) !== undefined ? { status: finiteNumber(cause.status) } : {}),
    };
  }
  return { name: "Cause", message: String(cause) };
}

function errorMessage(input: unknown): string {
  if (input instanceof Error && input.message) return input.message;
  if (typeof input === "string" && input.trim()) return input;
  const candidate = nestedString(input, ["message", "detail", "title"]);
  return candidate ?? "Unknown error";
}

function errorCode(input: unknown): string {
  return nestedString(input, ["code", "errorCode", "type"]) ?? (input instanceof Error && input.name ? input.name : "UNKNOWN_ERROR");
}

/** Classifies explicit flags, transient codes, and conventional HTTP statuses. */
export function isRetryableError(input: unknown): boolean {
  const code = errorCode(input);
  const isAbort = (input instanceof Error && input.name === "AbortError") || /^(?:ABORT|ABORTED)$/i.test(code);
  if (isAbort) return false;
  const explicit = firstNestedValue(input, ["retryable"]);
  if (typeof explicit === "boolean") return explicit;
  const status = extractStatus(input);
  if (status !== undefined) return RETRYABLE_STATUSES.has(status);
  return RETRYABLE_CODES.test(code);
}

/** Generates IDs without requiring a browser or a runtime dependency. */
export const defaultIdFactory: IdFactory = () => {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

function redactKey(key: string, options: RedactionOptions): boolean {
  const sensitive = [...DEFAULT_SENSITIVE_KEYS, ...(options.redactKeys ?? [])].map((item) => item.toLowerCase());
  const lower = key.toLowerCase().replace(/[._-]/g, "");
  return sensitive.some((item) => lower.includes(item.replace(/[._-]/g, "")));
}

/** Creates bounded, circular-safe data suitable for logs or JSON output. */
export function redactSensitive(value: unknown, options: RedactionOptions = {}): unknown {
  const replacement = options.replacement ?? REDACTED;
  const maxDepth = options.maxDepth ?? 6;
  const maxKeys = options.maxKeys ?? 100;
  const seen = new WeakSet<object>();
  const visit = (current: unknown, depth: number): unknown => {
    if (current === null || typeof current === "string" || typeof current === "number" || typeof current === "boolean") return current;
    if (typeof current === "bigint") return String(current);
    if (typeof current === "undefined") return undefined;
    if (typeof current === "function" || typeof current === "symbol") return `[${typeof current}]`;
    if (depth >= maxDepth) return "[MaxDepth]";
    if (current instanceof Error) {
      return { name: current.name, message: current.message };
    }
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    if (Array.isArray(current)) return current.slice(0, maxKeys).map((item) => visit(item, depth + 1));
    const output: UnknownRecord = {};
    for (const [key, item] of Object.entries(current).slice(0, maxKeys)) {
      output[key] = redactKey(key, options) ? replacement : visit(item, depth + 1);
    }
    return output;
  };
  return visit(value, 0);
}

/** Normalizes any thrown value into a safe, stable AppError. */
export function normalizeError(input: unknown, options: NormalizeErrorOptions = {}): AppError {
  const source = isRecord(input) ? input : undefined;
  const technicalMessage = errorMessage(input);
  const code = options.code ?? errorCode(input);
  const status = extractStatus(input);
  const idFactory = options.idFactory ?? defaultIdFactory;
  const supportId = options.supportId ?? extractId(input, ["supportId", "support_id", "support-id", "x-support-id"]) ?? idFactory();
  const correlationId = options.correlationId ?? extractId(input, ["correlationId", "correlation_id", "correlation-id", "requestId", "request-id", "x-correlation-id", "x-request-id"]) ?? idFactory();
  const detailsSource = options.details ?? source?.details;
  const fieldErrors = options.fieldErrors ?? extractFieldErrors(input);
  const severity = options.severity ?? (stringValue(source?.severity) as ErrorSeverity | undefined) ?? "error";
  const cause = causeSummary(input);
  return {
    name: "AppError",
    code,
    message: technicalMessage,
    technicalMessage,
    userMessage: options.userMessage ?? stringValue(source?.userMessage) ?? DEFAULT_USER_MESSAGE,
    severity: ["info", "warning", "error", "critical"].includes(severity) ? severity : "error",
    retryable: options.retryable ?? isRetryableError(input),
    supportId,
    correlationId,
    ...(status !== undefined ? { status } : {}),
    fieldErrors,
    ...(detailsSource !== undefined ? { details: redactSensitive(detailsSource, { redactKeys: options.redactKeys }) } : {}),
    ...(cause ? { cause } : {}),
  };
}

export const toAppError = normalizeError;

export function isAppError(value: unknown): value is AppError {
  return isRecord(value) && value.name === "AppError" && typeof value.code === "string" && typeof value.supportId === "string";
}

/** Produces a JSON-safe, redacted representation for logs or support bundles. */
export function serializeAppError(error: AppError, options?: RedactionOptions): Record<string, unknown> {
  const serialized: UnknownRecord = {
    name: error.name,
    code: error.code,
    message: error.message,
    technicalMessage: error.technicalMessage,
    userMessage: error.userMessage,
    severity: error.severity,
    retryable: error.retryable,
    supportId: error.supportId,
    correlationId: error.correlationId,
    fieldErrors: redactSensitive(error.fieldErrors, options),
  };
  if (error.status !== undefined) serialized.status = error.status;
  if (error.details !== undefined) serialized.details = redactSensitive(error.details, options);
  if (error.cause !== undefined) serialized.cause = redactSensitive(error.cause, options);
  return serialized;
}

export const serializeError = serializeAppError;

/** Reports a normalised error while preventing a reporter failure from masking it. */
export function reportError(
  input: unknown,
  reporter?: ErrorReporter,
  options?: NormalizeErrorOptions,
): AppError {
  const error = normalizeError(input, options);
  try {
    const result = reporter?.report(error);
    if (result && typeof result === "object" && "then" in result) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // Reporting is deliberately best-effort; the application error remains authoritative.
  }
  return error;
}
