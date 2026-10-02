/** A tiny external store; snapshot containers are frozen and referentially stable. */
export function createStore<S>(initial: S) {
  let state = Object.freeze(initial);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set: (next: S) => { state = Object.freeze(next); for (const listener of [...listeners]) listener(); },
  };
}

/** Own and freeze JSON-like values. Reject values that cannot be serialized safely. */
export function snapshot<T>(value: T): T {
  const seen = new Set<object>();
  const visit = (input: unknown): unknown => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input !== "object" || input === null) throw new TypeError("Expected finite JSON-compatible data");
    if (seen.has(input)) throw new TypeError("Cyclic data is not supported");
    const proto = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && proto !== Object.prototype && proto !== null) throw new TypeError("Expected plain objects or arrays");
    seen.add(input);
    const output = Array.isArray(input) ? input.map(visit) : Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, visit(entry)]));
    seen.delete(input);
    return Object.freeze(output);
  };
  return visit(value) as T;
}
