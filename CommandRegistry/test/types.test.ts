import { createCommandRegistry, defineCommand } from "../src/core.js";
import { useCommandRegistry } from "../src/react.js";
type Context = { allowed: boolean };
const registry = createCommandRegistry({
  save: defineCommand<Context, { id: string }, number>({ label: "Save", available: (context) => context.allowed, run: (_context, args) => args.id.length }),
}, () => ({ allowed: true }));
registry.execute("save", { id: "1" }).then((outcome) => { if (outcome.status === "succeeded") { const result: number = outcome.result; void result; } });
useCommandRegistry(registry).registry.execute("save", { id: "2" });
// @ts-expect-error unknown commands are rejected
registry.execute("delete", { id: "1" });
// @ts-expect-error argument types belong to each command
registry.execute("save", { id: 1 });
