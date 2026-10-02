import { safeFilename } from "./core.js";

/** Returns cleanup; URLs are also revoked automatically after the click is processed. */
export function downloadExport(source: string | Blob, options: { filename: string; mimeType?: string; document?: Document; url?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> }): () => void {
  const target = options.document ?? (typeof document === "undefined" ? undefined : document);
  const urls = options.url ?? (typeof URL === "undefined" ? undefined : URL);
  if (!target || !urls?.createObjectURL || !target.body) throw new Error("Browser download APIs are unavailable");
  const blob = typeof source === "string" ? new Blob([source], { type: options.mimeType ?? "text/plain;charset=utf-8" }) : source;
  const href = urls.createObjectURL(blob);
  let revoked = false;
  const cleanup = () => { if (!revoked) { urls.revokeObjectURL(href); revoked = true; } };
  const anchor = target.createElement("a");
  try {
    anchor.href = href; anchor.download = safeFilename(options.filename); anchor.style.display = "none";
    target.body.appendChild(anchor); anchor.click();
  } catch (error) { cleanup(); throw error; }
  finally { anchor.remove(); }
  setTimeout(cleanup, 1000);
  return cleanup;
}
