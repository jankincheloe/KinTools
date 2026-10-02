import { createStore } from "./internal.js";

export type CommandDefinition<C, A, R> = {
  label: string; scope?: string;
  available?: (context: C, args: A) => boolean;
  run: (context: C, args: A, signal: AbortSignal) => R | Promise<R>;
};
export type CommandMap<C> = Record<string, CommandDefinition<C, any, any>>;
export type CommandArgs<D> = D extends CommandDefinition<any, infer A, any> ? A : never;
export type CommandResult<D> = D extends CommandDefinition<any, any, infer R> ? Awaited<R> : never;
export type CommandState<K extends string> = { readonly running: readonly K[]; readonly disposed: boolean };
export type CommandOutcome<R> = { status: "succeeded"; result: R } | { status: "unavailable" | "busy" | "cancelled" } | { status: "failed"; error: unknown };
/** Define commands with full contextual typing, then pass them to the registry. */
export function defineCommand<C, A = void, R = void>(definition: CommandDefinition<C, A, R>): CommandDefinition<C, A, R> { return Object.freeze({ ...definition }); }
export function createCommandRegistry<C, D extends CommandMap<C>>(definitions: D, getContext: () => C) {
  type Key = Extract<keyof D, string>;
  const commands = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id, definition]) => [id, Object.freeze({ ...definition })]))) as D;
  const store = createStore<CommandState<Key>>({ running: Object.freeze([]), disposed: false });
  const active = new Map<Key, AbortController>();
  const available = <K extends Key>(id: K, args: CommandArgs<D[K]>): boolean => {
    if (store.getState().disposed || !Object.hasOwn(commands, id)) return false;
    try { return commands[id].available?.(getContext(), args) ?? true; } catch { return false; }
  };
  const publish = () => store.set({ ...store.getState(), running: Object.freeze([...active.keys()]) });
  return {
    getState: store.getState, subscribe: store.subscribe, available,
    list: () => Object.freeze(Object.keys(commands).map((id) => Object.freeze({ id: id as Key, label: commands[id].label, scope: commands[id].scope }))),
    async execute<K extends Key>(id: K, args: CommandArgs<D[K]>): Promise<CommandOutcome<CommandResult<D[K]>>> {
      if (active.has(id)) return { status: "busy" };
      // Evaluate and execute against the same context snapshot.
      if (store.getState().disposed || !Object.hasOwn(commands, id)) return { status: "unavailable" };
      let context: C;
      try { context = getContext(); if (commands[id].available && !commands[id].available!(context, args)) return { status: "unavailable" }; }
      catch { return { status: "unavailable" }; }
      const controller = new AbortController(); active.set(id, controller); publish();
      try {
        if (controller.signal.aborted) return { status: "cancelled" };
        const result = await commands[id].run(context, args, controller.signal);
        return controller.signal.aborted ? { status: "cancelled" } : { status: "succeeded", result };
      } catch (error) { return controller.signal.aborted ? { status: "cancelled" } : { status: "failed", error }; }
      finally { active.delete(id); publish(); }
    },
    cancel(id: Key) { const controller = active.get(id); if (!controller) return false; controller.abort(); return true; },
    dispose() { store.set({ ...store.getState(), disposed: true }); for (const controller of active.values()) controller.abort(); },
  };
}
