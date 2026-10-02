import { useSyncExternalStore } from "react";
import { createFileUpload, type UploadFile } from "./core.js";

/** Observe a caller-owned controller. Create it once and dispose it in its owner. */
export function useFileUpload<F extends UploadFile, R>(upload: ReturnType<typeof createFileUpload<F, R>>) {
  const state = useSyncExternalStore(upload.subscribe, upload.getState, upload.getState);
  return { state, upload };
}
