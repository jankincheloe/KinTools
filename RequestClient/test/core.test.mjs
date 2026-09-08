import assert from "node:assert/strict";
import test from "node:test";

import { RequestError, createRequestClient } from "../dist/index.js";

function response(body, init = {}) {
  return new Response(body, init);
}

test("parses JSON, text, Blob and ArrayBuffer responses and safely builds query/header values", async () => {
  const calls = [];
  const client = createRequestClient({
    baseUrl: "https://api.example.test/v1/",
    defaultHeaders: { "X-Default": "default", "X-Override": "default" },
    authHeader: () => "Bearer token",
    fetch: async (input, init) => {
      calls.push({ input: String(input), init });
      const url = new URL(String(input));
      if (url.pathname.endsWith("/json")) {
        return response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Request-ID": "req-123" },
        });
      }
      if (url.pathname.endsWith("/text")) return response("hello", { status: 200 });
      if (url.pathname.endsWith("/blob")) return response("blob-value", { status: 200 });
      return response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });

  const json = await client.get("/json?existing=keep", {
    query: { q: "a b", repeated: ["x", "y"], zero: 0, no: null, missing: undefined },
    headers: { "X-Override": "request", "X-Request-ID": "sent-1" },
  });
  assert.deepEqual(json.data, { ok: true });
  assert.equal(json.requestId, "req-123");
  assert.equal(calls[0].input, "https://api.example.test/json?existing=keep&q=a+b&repeated=x&repeated=y&zero=0");
  assert.equal(calls[0].init.headers.get("x-default"), "default");
  assert.equal(calls[0].init.headers.get("x-override"), "request");
  assert.equal(calls[0].init.headers.get("authorization"), "Bearer token");
  assert.equal(calls[0].init.headers.get("x-request-id"), "sent-1");

  assert.equal((await client.requestText("/text")).data, "hello");
  assert.equal((await client.requestBlob("/blob")).data.text instanceof Function, true);
  assert.deepEqual([...new Uint8Array((await client.requestArrayBuffer("/bytes")).data)], [1, 2, 3]);
});

test("normalises HTTP and network failures and propagates request IDs", async () => {
  const fallbackHttpClient = createRequestClient({
    fetch: async () => response("bad", { status: 503 }),
  });
  await assert.rejects(fallbackHttpClient.get("https://example.test/fail", { requestId: "out-http" }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.status, 503);
    assert.equal(error.code, "http_error");
    assert.equal(error.retryable, true);
    assert.equal(error.requestId, "out-http");
    assert.equal(error.body, "bad");
    return true;
  });

  const serverHttpClient = createRequestClient({
    fetch: async () => response("server-bad", { status: 503, headers: { "Request-ID": "server-1" } }),
  });
  await assert.rejects(serverHttpClient.get("https://example.test/fail", { requestId: "out-http" }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.status, 503);
    assert.equal(error.code, "http_error");
    assert.equal(error.retryable, true);
    assert.equal(error.requestId, "server-1");
    assert.equal(error.body, "server-bad");
    return true;
  });

  const networkClient = createRequestClient({
    fetch: async () => { throw new Error("offline"); },
  });
  await assert.rejects(networkClient.get("https://example.test/network", { requestId: "out-network" }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "network_error");
    assert.equal(error.retryable, true);
    assert.equal(error.requestId, "out-network");
    assert.equal(error.cause.message, "offline");
    return true;
  });

  const parseClient = createRequestClient({
    fetch: async () => response("not-json", { status: 200 }),
  });
  await assert.rejects(parseClient.get("https://example.test/parse", { requestId: "out-parse" }), (error) => {
    assert.equal(error.code, "parse_error");
    assert.equal(error.requestId, "out-parse");
    return true;
  });
});

test("combines timeout and external abort signals and cleans up timeout/listeners", async () => {
  const timeoutSignals = [];
  const client = createRequestClient({
    timeoutMs: 10,
    fetch: async (_input, init) => {
      timeoutSignals.push(init.signal);
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        if (init.signal.aborted) reject(init.signal.reason);
      });
    },
  });

  await assert.rejects(client.get("https://example.test/timeout", { requestId: "out-timeout" }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "timeout");
    assert.equal(error.requestId, "out-timeout");
    return true;
  });
  assert.equal(timeoutSignals.length, 1);
  assert.equal(timeoutSignals[0].aborted, true);

  const controller = new AbortController();
  const abortClient = createRequestClient({
    fetch: async (_input, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }),
  });
  const pending = abortClient.get("https://example.test/abort", { signal: controller.signal });
  controller.abort(new Error("user cancelled"));
  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "aborted");
    assert.equal(error.retryable, false);
    return true;
  });
});

test("retries transient failures with injected exponential backoff only for safe/idempotent methods", async () => {
  const attempts = [];
  const sleeps = [];
  let calls = 0;
  const client = createRequestClient({
    retry: { maxRetries: 2, baseDelayMs: 5, backoffFactor: 2 },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetch: async (_input, init) => {
      attempts.push(init.method);
      calls += 1;
      return calls < 3 ? response("retry", { status: 503 }) : response("ok", { status: 200 });
    },
  });
  assert.equal((await client.requestText("https://example.test/retry")).data, "ok");
  assert.deepEqual(attempts, ["GET", "GET", "GET"]);
  assert.deepEqual(sleeps, [5, 10]);

  let postCalls = 0;
  const postClient = createRequestClient({
    retry: { maxRetries: 2, baseDelayMs: 1 },
    sleep: async () => assert.fail("POST must not be retried"),
    fetch: async () => {
      postCalls += 1;
      return response("no", { status: 503 });
    },
  });
  await assert.rejects(postClient.post("https://example.test/no-retry", { value: 1 }));
  assert.equal(postCalls, 1);
});

test("aborts immediately during retry backoff and cleans up the abort listener", async () => {
  let resolveSleep;
  let sleepStarted;
  const sleepStartedPromise = new Promise((resolve) => { sleepStarted = resolve; });
  const sleepPromise = new Promise((resolve) => { resolveSleep = resolve; });
  let calls = 0;
  const controller = new AbortController();
  const client = createRequestClient({
    retry: { maxRetries: 1, baseDelayMs: 1000 },
    sleep: () => {
      sleepStarted();
      return sleepPromise;
    },
    fetch: async () => {
      calls += 1;
      throw new Error("offline");
    },
  });

  const pending = client.get("https://example.test/backoff", {
    signal: controller.signal,
    requestId: "out-backoff",
  });
  await sleepStartedPromise;
  controller.abort(new Error("cancelled during backoff"));
  const outcome = await Promise.race([
    pending.then(() => ({ kind: "resolved" }), (error) => ({ kind: "error", error })),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 50)),
  ]);
  resolveSleep();
  assert.notEqual(outcome.kind, "timeout", "abort must not wait for the injected sleep promise");
  assert.equal(outcome.kind, "error");
  assert.ok(outcome.error instanceof RequestError);
  assert.equal(outcome.error.code, "aborted");
  assert.equal(outcome.error.requestId, "out-backoff");
  assert.equal(calls, 1);
});

test("deduplicates concurrent 401 refreshes and allows one auth replay per request", async () => {
  let token = "old";
  let refreshes = 0;
  let requests = 0;
  let resolveRefresh;
  const refreshGate = new Promise((resolve) => { resolveRefresh = resolve; });
  const client = createRequestClient({
    auth: {
      getHeader: () => `Bearer ${token}`,
      refresh: async () => {
        refreshes += 1;
        await refreshGate;
        token = "new";
        return `Bearer ${token}`;
      },
    },
    fetch: async (_input, init) => {
      requests += 1;
      const authorization = init.headers.get("authorization");
      if (authorization === "Bearer old") return response("expired", { status: 401, headers: { "X-Request-ID": `old-${requests}` } });
      return response(JSON.stringify({ token: authorization }), { status: 200 });
    },
  });

  const first = client.get("https://example.test/a");
  const second = client.get("https://example.test/b");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshes, 1);
  resolveRefresh();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map((result) => result.data.token), ["Bearer new", "Bearer new"]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 4);
});

test("rejects relative URLs without a base URL", async () => {
  const client = createRequestClient({ fetch: async () => response("unexpected") });
  await assert.rejects(client.get("/relative", { requestId: "out-url" }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "invalid_url");
    assert.equal(error.requestId, "out-url");
    return true;
  });

  const bodyClient = createRequestClient({ fetch: async () => response("unexpected") });
  await assert.rejects(bodyClient.request("https://example.test/body", {
    json: { value: 1 },
    body: "also-present",
    requestId: "out-body",
  }), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, "invalid_request");
    assert.equal(error.requestId, "out-body");
    return true;
  });
});
