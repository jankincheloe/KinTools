export type Shortcut = {
  key: string; ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean; mod?: boolean;
  scope?: string; allowInEditable?: boolean;
  available?: () => boolean; run: () => void | Promise<unknown>;
};
export type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "isComposing" | "defaultPrevented" | "target" | "preventDefault">;
function editable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || element.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')));
}
export function matchesShortcut(shortcut: Shortcut, event: ShortcutEvent): boolean {
  if (event.repeat || event.isComposing || event.defaultPrevented || (!shortcut.allowInEditable && editable(event.target))) return false;
  if (shortcut.key.toLowerCase() !== event.key.toLowerCase() || Boolean(shortcut.alt) !== event.altKey || Boolean(shortcut.shift) !== event.shiftKey) return false;
  return shortcut.mod
    ? (event.ctrlKey !== event.metaKey)
    : Boolean(shortcut.ctrl) === event.ctrlKey && Boolean(shortcut.meta) === event.metaKey;
}
/** Last active scope wins; one matching command handles a key event. */
export function createShortcutHandler(shortcuts: readonly Shortcut[], options: { getScopes?: () => readonly string[]; onError?: (error: unknown) => void } = {}) {
  const bindings = shortcuts.map((shortcut) => Object.freeze({ ...shortcut }));
  return (event: ShortcutEvent): boolean => {
    const scopes = options.getScopes?.() ?? [];
    const candidates = bindings.filter((binding) => !binding.scope || scopes.includes(binding.scope))
      .sort((a, b) => (b.scope ? scopes.lastIndexOf(b.scope) + 1 : 0) - (a.scope ? scopes.lastIndexOf(a.scope) + 1 : 0));
    for (const binding of candidates) {
      if (!matchesShortcut(binding, event)) continue;
      try { if (binding.available && !binding.available()) continue; }
      catch (error) { options.onError?.(error); continue; }
      event.preventDefault();
      try { Promise.resolve(binding.run()).catch((error) => options.onError?.(error)); }
      catch (error) { options.onError?.(error); }
      return true;
    }
    return false;
  };
}
export function bindShortcuts(shortcuts: readonly Shortcut[], options: { target?: Pick<Document, "addEventListener" | "removeEventListener">; getScopes?: () => readonly string[]; onError?: (error: unknown) => void } = {}): () => void {
  const target = options.target ?? (typeof document === "undefined" ? undefined : document);
  if (!target) return () => {};
  const handler = createShortcutHandler(shortcuts, options);
  const listener = (event: Event) => { handler(event as KeyboardEvent); };
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
