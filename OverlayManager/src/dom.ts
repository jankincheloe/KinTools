/** Small DOM-only helpers used by the optional React adapter. */

export type DocumentLike = Document;

const scrollLocks = new WeakMap<DocumentLike, { count: number; overflow: string; paddingRight: string }>();

function browserDocument(documentValue?: DocumentLike): DocumentLike | undefined {
  return documentValue ?? (typeof document === "undefined" ? undefined : document);
}

/**
 * Acquires a reference-counted body scroll lock. The returned release function
 * is idempotent and restores the exact inline styles from before the first lock.
 */
export function acquireScrollLock(documentValue?: DocumentLike): () => void {
  const documentObject = browserDocument(documentValue);
  const body = documentObject?.body;
  if (!documentObject || !body) return () => undefined;

  let record = scrollLocks.get(documentObject);
  if (record) {
    record.count += 1;
  } else {
    record = { count: 1, overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    scrollLocks.set(documentObject, record);
    const viewportGap = Math.max(0, (documentObject.defaultView?.innerWidth ?? 0) - documentObject.documentElement.clientWidth);
    body.style.overflow = "hidden";
    if (viewportGap > 0 && body.style.paddingRight === record.paddingRight) {
      body.style.paddingRight = `${viewportGap}px`;
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = scrollLocks.get(documentObject);
    if (!current) return;
    current.count -= 1;
    if (current.count > 0) return;
    body.style.overflow = current.overflow;
    body.style.paddingRight = current.paddingRight;
    scrollLocks.delete(documentObject);
  };
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "object",
  "embed",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    return element.getClientRects().length > 0;
  });
}

export function focusFirst(container: HTMLElement): HTMLElement | undefined {
  const focusable = getFocusableElements(container);
  const target = focusable[0] ?? container;
  if (target === container && !container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  return target;
}

/** Moves Tab focus within a modal container; returns true when the event was handled. */
export function trapFocus(event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">, container: HTMLElement): boolean {
  if (event.key !== "Tab") return false;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    focusFirst(container);
    return true;
  }
  const active = container.ownerDocument.activeElement;
  const currentIndex = focusable.indexOf(active as HTMLElement);
  const nextIndex = event.shiftKey
    ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
    : currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
  event.preventDefault();
  focusable[nextIndex].focus({ preventScroll: true });
  return true;
}

/** Calls closeTop only for an unhandled Escape and consumes the event on success. */
export function handleEscape(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "preventDefault" | "stopPropagation">,
  closeTop: () => string | undefined,
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const closed = closeTop();
  if (!closed) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}
