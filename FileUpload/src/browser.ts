import type { UploadTransport } from "./core.js";

export type XhrUploadOptions<R> = {
  url: string | ((file: File) => string); method?: "POST" | "PUT" | "PATCH";
  headers?: Readonly<Record<string, string>>; fieldName?: string; timeoutMs?: number;
  decode?: (body: string, status: number) => R;
  createXHR?: () => XMLHttpRequest;
};
/** Multipart transport with real upload progress; instantiated lazily for SSR. */
export function createXhrUploadTransport<R = unknown>(options: XhrUploadOptions<R>): UploadTransport<File, R> {
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)) throw new RangeError("Invalid upload timeout");
  return {
    upload(file, { signal, onProgress }) {
      return new Promise<R>((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException("Upload aborted", "AbortError")); return; }
        const xhr = options.createXHR?.() ?? new XMLHttpRequest();
        let settled = false;
        const finish = (error?: unknown, result?: R) => {
          if (settled) return; settled = true;
          signal.removeEventListener("abort", abort);
          xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null; xhr.upload.onprogress = null;
          if (error !== undefined) reject(error); else resolve(result as R);
        };
        const abort = () => { xhr.abort(); finish(new DOMException("Upload aborted", "AbortError")); };
        try {
          xhr.open(options.method ?? "POST", typeof options.url === "function" ? options.url(file) : options.url);
          xhr.timeout = options.timeoutMs ?? 0;
          for (const [name, value] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(name, value);
          xhr.upload.onprogress = (event) => { if (!settled) onProgress(event.loaded, event.lengthComputable ? event.total : file.size); };
          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) { finish(Object.assign(new Error(`Upload HTTP ${xhr.status}`), { status: xhr.status })); return; }
            try { finish(undefined, options.decode ? options.decode(xhr.responseText, xhr.status) : (xhr.responseText ? JSON.parse(xhr.responseText) : null) as R); }
            catch (error) { finish(error); }
          };
          xhr.onerror = () => finish(new Error("Upload network error"));
          xhr.ontimeout = () => finish(new Error("Upload timeout"));
          xhr.onabort = () => finish(new DOMException("Upload aborted", "AbortError"));
          signal.addEventListener("abort", abort, { once: true });
          const body = new FormData(); body.append(options.fieldName ?? "file", file, file.name);
          xhr.send(body);
        } catch (error) { finish(error); }
      });
    },
  };
}
