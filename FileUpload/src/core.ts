import { createTaskQueue, type TaskStatus } from "./queue.js";
import { createStore } from "./internal.js";

export type UploadFile = { readonly name: string; readonly size: number; readonly type: string };
export type FileIssue = { readonly code: "invalid_file" | "too_large" | "type_not_allowed" | "too_many_files" };
export type FileRules = { maxSize?: number; accept?: readonly string[]; maxFiles?: number };
export type UploadTransport<F extends UploadFile, R> = { upload: (file: F, context: { signal: AbortSignal; onProgress: (loaded: number, total?: number) => void }) => R | Promise<R> };
export type UploadStatus = TaskStatus;
export type UploadEntry<F, R> = { readonly id: string; readonly file: F; readonly status: UploadStatus; readonly progress: number; readonly loaded: number; readonly total: number; readonly attempt: number; readonly result?: R; readonly error?: unknown };
export type UploadState<F, R> = { readonly files: readonly UploadEntry<F, R>[]; readonly paused: boolean; readonly disposed: boolean };
function checkRules(rules: FileRules) {
  if (rules.maxSize !== undefined && (!Number.isFinite(rules.maxSize) || rules.maxSize < 0)) throw new RangeError("Invalid maximum file size");
  if (rules.maxFiles !== undefined && (!Number.isInteger(rules.maxFiles) || rules.maxFiles < 1)) throw new RangeError("Invalid maximum file count");
  if (rules.accept?.some((entry) => !/^\.[a-z0-9]+$|^[a-z0-9.+-]+\/(?:[a-z0-9.+-]+|\*)$/i.test(entry))) throw new TypeError("Invalid accepted file type");
}
export function validateFile(file: UploadFile, rules: FileRules = {}): readonly FileIssue[] {
  checkRules(rules);
  if (!file || typeof file.name !== "string" || !file.name.trim() || typeof file.type !== "string" || !Number.isSafeInteger(file.size) || file.size < 0) return Object.freeze([{ code: "invalid_file" }]);
  const issues: FileIssue[] = [];
  if (rules.maxSize !== undefined && file.size > rules.maxSize) issues.push({ code: "too_large" });
  if (rules.accept?.length && !rules.accept.some((entry) => {
    const pattern = entry.toLowerCase();
    return pattern.startsWith(".") ? file.name.toLowerCase().endsWith(pattern)
      : pattern.endsWith("/*") ? file.type.toLowerCase().startsWith(pattern.slice(0, -1))
      : file.type.toLowerCase() === pattern;
  })) issues.push({ code: "type_not_allowed" });
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}
export function createFileUpload<F extends UploadFile, R = unknown>(options: { transport: UploadTransport<F, R>; rules?: FileRules; concurrency?: number; paused?: boolean }) {
  const rules = { ...options.rules, accept: options.rules?.accept ? [...options.rules.accept] : undefined }; checkRules(rules);
  const queue = createTaskQueue<R>({ concurrency: options.concurrency, paused: options.paused });
  const files = new Map<string, F>();
  const bytes = new Map<string, { loaded: number; total: number }>();
  const store = createStore<UploadState<F, R>>({ files: Object.freeze([]), paused: options.paused ?? false, disposed: false });
  let sequence = 0;
  const sync = () => {
    const state = queue.getState();
    store.set({ paused: state.paused, disposed: state.disposed, files: Object.freeze(state.tasks.map((task) => {
      const file = files.get(task.id)!;
      const progress = bytes.get(task.id) ?? { loaded: 0, total: file.size };
      return Object.freeze({ ...task, file, ...progress, ...(task.status === "succeeded" ? { loaded: progress.total } : {}) });
    })) });
  };
  const unsubscribe = queue.subscribe(sync);
  return {
    getState: store.getState, subscribe: store.subscribe,
    add(input: readonly F[]) {
      if (queue.getState().disposed) throw new Error("FileUpload is disposed");
      const accepted: string[] = [];
      const rejected: { file: F; issues: readonly FileIssue[] }[] = [];
      for (const file of input) {
        let issues = validateFile(file, rules);
        if (!issues.length && rules.maxFiles !== undefined && files.size >= rules.maxFiles) issues = Object.freeze([Object.freeze({ code: "too_many_files" as const })]);
        if (issues.length) { rejected.push({ file, issues }); continue; }
        const id = `upload-${++sequence}`; files.set(id, file); bytes.set(id, { loaded: 0, total: file.size });
        queue.add(({ signal, reportProgress }) => options.transport.upload(file, { signal, onProgress(loaded, total = file.size) {
          if (signal.aborted || queue.getState().tasks.find((task) => task.id === id)?.status !== "running" || !Number.isFinite(loaded) || !Number.isFinite(total) || total < 0) return;
          const safeLoaded = Math.max(0, Math.min(total, loaded));
          bytes.set(id, { loaded: safeLoaded, total }); reportProgress(total > 0 ? safeLoaded / total : 0);
        } }), id);
        accepted.push(id);
      }
      return { accepted: Object.freeze(accepted), rejected: Object.freeze(rejected.map((entry) => Object.freeze(entry))) };
    },
    cancel: queue.cancel, cancelAll: queue.cancelAll, pause: queue.pause, resume: queue.resume,
    retry(id: string) {
      const old = bytes.get(id);
      bytes.set(id, { loaded: 0, total: files.get(id)?.size ?? 0 });
      const retried = queue.retry(id);
      if (!retried) { if (old) bytes.set(id, old); else bytes.delete(id); }
      return retried;
    },
    remove(id: string) { if (!queue.remove(id)) return false; files.delete(id); bytes.delete(id); return true; },
    waitForIdle: queue.waitForIdle,
    dispose() { queue.dispose(); unsubscribe(); },
  };
}
