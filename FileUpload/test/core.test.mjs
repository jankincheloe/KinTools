import assert from "node:assert/strict";
import test from "node:test";
import { createFileUpload, validateFile } from "../dist/core.js";
import { createXhrUploadTransport } from "../dist/browser.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const file = (name = "photo.png", size = 10, type = "image/png") => ({ name, size, type });
test("validates size, MIME wildcards, extensions and malformed metadata", () => {
  assert.deepEqual(validateFile(file(), { accept: ["image/*"], maxSize: 10 }), []);
  assert.deepEqual(validateFile(file("DATA.CSV", 1, ""), { accept: [".csv"] }), []);
  assert.deepEqual(validateFile(file("bad.exe", 20, "application/binary"), { accept: ["image/*"], maxSize: 10 }).map((issue) => issue.code), ["too_large", "type_not_allowed"]);
  assert.equal(validateFile(file("x", NaN))[0].code, "invalid_file"); assert.throws(() => validateFile(file(), { accept: ["bad"] }));
});
test("uploads concurrently, exposes progress and rejects excess/invalid files", async () => {
  const gates = []; let active = 0, peak = 0;
  const upload = createFileUpload({ concurrency: 2, rules: { maxFiles: 3, accept: ["image/*"] }, transport: { async upload(file, { onProgress }) {
    active++; peak = Math.max(peak, active); onProgress(5, 10); await new Promise((resolve) => gates.push(resolve)); active--; return file.name;
  } } });
  const result = upload.add([file("1.png"), file("2.png"), file("3.png"), file("4.png"), file("bad.txt", 1, "text/plain")]);
  assert.equal(result.accepted.length, 3); assert.deepEqual(result.rejected.map((entry) => entry.issues[0].code), ["too_many_files", "type_not_allowed"]);
  await tick(); assert.equal(upload.getState().files[0].progress, 0.5); gates.shift()(); await tick();
  for (const resolve of gates) resolve(); await upload.waitForIdle();
  assert.equal(peak, 2); assert.deepEqual(upload.getState().files.map((entry) => entry.result), ["1.png", "2.png", "3.png"]);
  assert.equal(upload.remove(result.accepted[0]), true); upload.dispose();
});
test("cancelled upload ignores late progress/results and can retry after settlement", async () => {
  let resolve, context, calls = 0;
  const upload = createFileUpload({ concurrency: 1, transport: { upload(_file, ctx) { context = ctx; calls++; return calls === 1 ? new Promise((r) => { resolve = r; }) : "retry"; } } });
  const id = upload.add([file()]).accepted[0]; await tick(); upload.cancel(id);
  assert.equal(context.signal.aborted, true); context.onProgress(9, 10); resolve("late"); await upload.waitForIdle();
  assert.equal(upload.getState().files[0].loaded, 0); assert.equal(upload.getState().files[0].result, undefined);
  assert.equal(upload.retry(id), true); await upload.waitForIdle(); assert.equal(upload.getState().files[0].result, "retry"); upload.dispose();
});
test("failure, retry, pause/resume and disposal preserve lifecycle state", async () => {
  let calls = 0;
  const upload = createFileUpload({ paused: true, transport: { upload() { if (++calls === 1) throw new Error("offline"); return "ok"; } } });
  const id = upload.add([file()]).accepted[0]; await tick(); assert.equal(calls, 0); upload.resume(); await upload.waitForIdle();
  assert.equal(upload.getState().files[0].status, "failed"); upload.retry(id); await upload.waitForIdle(); assert.equal(upload.getState().files[0].attempt, 2);
  upload.dispose(); assert.throws(() => upload.add([file()]), /disposed/);
});
function xhrMock() {
  return { upload: {}, headers: {}, status: 201, responseText: '{"id":"1"}', open(method, url) { this.method = method; this.url = url; }, setRequestHeader(name, value) { this.headers[name] = value; }, send(body) { this.body = body; }, abort() { this.aborted = true; this.onabort?.(); } };
}
const blobFile = () => Object.assign(new Blob(["x"], { type: "text/plain" }), { name: "doc.txt" });
test("XHR adapter sends multipart data, decodes responses and cleans callbacks", async () => {
  const xhr = xhrMock(); const controller = new AbortController(); const progress = [];
  const transport = createXhrUploadTransport({ url: "/upload", headers: { Authorization: "example" }, createXHR: () => xhr });
  const promise = transport.upload(blobFile(), { signal: controller.signal, onProgress: (...args) => progress.push(args) });
  assert.equal(xhr.method, "POST"); assert.equal(xhr.body.get("file").name, "doc.txt");
  xhr.upload.onprogress({ loaded: 1, total: 2, lengthComputable: true }); xhr.onload();
  assert.deepEqual(await promise, { id: "1" }); assert.deepEqual(progress, [[1, 2]]); assert.equal(xhr.onload, null);
  controller.abort(); assert.equal(xhr.aborted, undefined);
});
test("XHR adapter rejects abort, HTTP and malformed response failures", async () => {
  for (const kind of ["abort", "http", "parse", "timeout", "network"]) {
    const xhr = xhrMock(); const controller = new AbortController();
    const pending = createXhrUploadTransport({ url: "/upload", createXHR: () => xhr }).upload(blobFile(), { signal: controller.signal, onProgress: () => {} });
    if (kind === "abort") controller.abort();
    else if (kind === "http") { xhr.status = 500; xhr.onload(); }
    else if (kind === "parse") { xhr.responseText = "broken"; xhr.onload(); }
    else if (kind === "timeout") xhr.ontimeout(); else xhr.onerror();
    await assert.rejects(pending); assert.equal(xhr.onload, null);
  }
});
