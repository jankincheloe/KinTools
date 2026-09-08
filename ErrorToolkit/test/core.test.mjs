import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  extractFieldErrors,
  isRetryableError,
  normalizeError,
  redactSensitive,
  serializeAppError,
} from "../dist/core.js";

test("keeps root and core builds React-free", async () => {
  const [root, core] = await Promise.all([
    readFile(new URL("../dist/index.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/core.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(root, /(?:from|require\(['"])react/);
  assert.doesNotMatch(core, /(?:from|require\(['"])react/);
});

test("normalizes unknown and native errors without leaking technical copy", () => {
  const native = new Error("database password=do-not-display");
  const error = normalizeError(native, { idFactory: () => "generated-id" });
  assert.equal(error.name, "AppError");
  assert.equal(error.message, native.message);
  assert.equal(error.technicalMessage, native.message);
  assert.equal(error.userMessage, "Something went wrong. Please try again.");
  assert.equal(error.supportId, "generated-id");
  assert.equal(error.correlationId, "generated-id");

  const unknown = normalizeError(42, { userMessage: "Safe copy", idFactory: () => "id" });
  assert.equal(unknown.code, "UNKNOWN_ERROR");
  assert.equal(unknown.userMessage, "Safe copy");
});

test("normalizes nested API payloads and classifies retryability", () => {
  const error = normalizeError(
    {
      response: {
        status: 503,
        data: {
          code: "PROFILE_UPSTREAM",
          message: "upstream host unavailable",
          correlationId: "corr-123",
          errors: { email: ["Already used"] },
        },
      },
    },
    { supportId: "support-123", idFactory: () => "unused" },
  );
  assert.equal(error.code, "PROFILE_UPSTREAM");
  assert.equal(error.status, 503);
  assert.equal(error.retryable, true);
  assert.equal(error.correlationId, "corr-123");
  assert.deepEqual(error.fieldErrors, { email: ["Already used"] });
  assert.equal(isRetryableError({ status: 400 }), false);
  assert.equal(isRetryableError({ retryable: true, status: 400 }), true);
});

test("does not retry caller aborts but retries timeouts", () => {
  const abort = new Error("request cancelled");
  abort.name = "AbortError";
  assert.equal(isRetryableError(abort), false);
  assert.equal(isRetryableError({ code: "ABORTED" }), false);

  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  assert.equal(isRetryableError(timeout), true);
  assert.equal(isRetryableError({ code: "REQUEST_TIMEOUT" }), true);
});

test("extracts common field-error formats", () => {
  assert.deepEqual(
    extractFieldErrors({
      errors: [
        { path: "profile.name", message: "Required" },
        { source: { pointer: "/data/attributes/email" }, detail: "Invalid" },
      ],
    }),
    { "profile.name": ["Required"], email: ["Invalid"] },
  );
  assert.deepEqual(extractFieldErrors({ fieldErrors: { age: "Too young", code: ["Bad", "Bad"] } }), {
    age: ["Too young"],
    code: ["Bad"],
  });
});

test("redacts sensitive keys, handles cycles, and serializes safely", () => {
  const details = { password: "secret", profile: { apiKey: "key", visible: true } };
  details.self = details;
  const error = normalizeError({ code: "BAD_INPUT", message: "technical", details }, { idFactory: () => "id" });
  const serialized = serializeAppError(error);
  assert.equal(serialized.details.password, "[REDACTED]");
  assert.equal(serialized.details.profile.apiKey, "[REDACTED]");
  assert.equal(serialized.details.profile.visible, true);
  assert.equal(serialized.details.self, "[Circular]");
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.deepEqual(redactSensitive({ customSecret: "x" }, { redactKeys: ["customSecret"] }), {
    customSecret: "[REDACTED]",
  });
});

test("preserves supplied IDs and cause summary", () => {
  const error = normalizeError(
    { code: "CONFLICT", support_id: "sup", requestId: "req", cause: { name: "DbError", message: "duplicate", code: "E_DUP" } },
    { idFactory: () => { throw new Error("must not be called"); } },
  );
  assert.equal(error.supportId, "sup");
  assert.equal(error.correlationId, "req");
  assert.deepEqual(error.cause, { name: "DbError", message: "duplicate", code: "E_DUP" });
});

test("reads support and correlation IDs from Headers-like get interfaces", () => {
  const values = new Map([
    ["x-support-id", "support-from-header"],
    ["x-request-id", "request-from-header"],
  ]);
  const headers = { get: (name) => values.get(name.toLowerCase()) ?? null };
  const error = normalizeError(
    { response: { headers } },
    { idFactory: () => { throw new Error("must not be called"); } },
  );
  assert.equal(error.supportId, "support-from-header");
  assert.equal(error.correlationId, "request-from-header");
});
