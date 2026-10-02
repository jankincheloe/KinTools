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
