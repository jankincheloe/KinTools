# @jankincheloe/permission-evaluator

`@jankincheloe/permission-evaluator` is a small, framework-independent permission core for typed RBAC and ABAC policies. It evaluates an in-memory policy synchronously and has no authentication provider, network client, storage, or runtime dependency. The optional `./react` entry point only adapts the core to React.

## Installation

```sh
npm install @jankincheloe/permission-evaluator
```

The core is available from the package root or `@jankincheloe/permission-evaluator/core`. React consumers can import `PermissionProvider`, `usePermission`, and `PermissionGuard` from `@jankincheloe/permission-evaluator/react`. React is an optional peer dependency.

## Typed policy

Actions, roles, claims, and resource contexts can all be typed. `actions` is also a runtime allow-list, so a typo can be reported as `unknown_action` instead of silently looking like a missing rule.

```ts
import { createPermissionEvaluator, type PermissionRule } from "@jankincheloe/permission-evaluator";

type Action = "ticket.read" | "ticket.update" | "ticket.delete";
type Role = "agent" | "manager";
type Claims = { tenantId: string; suspended: boolean };
type User = { id: string; roles: readonly Role[]; claims: Claims };
type Context = { ticket: { tenantId: string; assigneeId: string }; tenant: string };

const rules: readonly PermissionRule<Action, Role, Claims, Context, User>[] = [
  { id: "agents-read", effect: "allow", action: "ticket.read", roles: ["agent", "manager"] },
  {
    id: "agents-update-own-tenant",
    effect: "allow",
    action: "ticket.update",
    roles: ["agent"],
    claims: { suspended: false },
    resource: (context, evaluation) =>
      context?.tenant === evaluation.claims.tenantId && context.ticket.assigneeId === evaluation.user.id,
  },
  // Deny always wins, even when a previous rule allowed the same request.
  { id: "suspended-deny", effect: "deny", action: "ticket.*", claims: { suspended: true } },
  { id: "manager-delete", effect: "allow", action: "ticket.delete", roles: ["manager"] },
];

const permissions = createPermissionEvaluator<Action, Role, Claims, Context, User>({
  actions: ["ticket.read", "ticket.update", "ticket.delete"],
  rules,
});

const user: User = {
  id: "u-1",
  roles: ["agent"],
  claims: { tenantId: "acme", suspended: false },
};

permissions.can(user, "ticket.update", {
  tenant: "acme",
  ticket: { tenantId: "acme", assigneeId: "u-1" },
}); // true

permissions.evaluate(user, "ticket.delete", undefined, { trace: true });
// { allowed: false, reason: "no_matching_rule", trace: [...] }
```

`can` and `cannot` return booleans. `evaluate` returns `{ allowed, action, reason, ruleId?, trace? }`. The reason codes are stable machine-readable values: `allowed`, `explicit_deny`, `unknown_action`, `no_matching_rule`, `missing_role`, `claim_mismatch`, `resource_predicate_failed`, `condition_failed`, `predicate_error`, and `invalid_wildcard`.

## React adapter

The adapter does not provide authentication. Pass the current principal and evaluator from the application layer. Changing either `user` or `evaluator` changes the context value and updates consumers.

```tsx
import { PermissionGuard, PermissionProvider, usePermission } from "@jankincheloe/permission-evaluator/react";

function UpdateButton({ ticket }: { ticket: Ticket }) {
  const permission = usePermission();
  if (!permission.can("ticket.update", { ticket })) return null;
  return <button onClick={() => update(ticket)}>Update</button>;
}

function TicketActions({ user, permissions, ticket }: Props) {
  return (
    <PermissionProvider user={user} evaluator={permissions}>
      <PermissionGuard action="ticket.delete" resource={{ ticket }} fallback={null}>
        {(evaluation) => <button data-reason={evaluation.reason}>Delete</button>}
      </PermissionGuard>
      <UpdateButton ticket={ticket} />
    </PermissionProvider>
  );
}
```

`PermissionGuard` supports a render-prop or regular `children`, plus a caller-provided `fallback`. It emits no product text, markup conventions, or styles. `usePermission("ticket.read", resource)` is a shorthand for an immediate evaluation; the no-argument form returns `{ evaluate, can, cannot }`.

The React API keeps application types when they are supplied explicitly. This is useful when a component is deliberately independent of the provider's concrete policy type:

```tsx
type Action = "ticket.read" | "ticket.update";
type TicketContext = { ticketId: string };

function TicketActions() {
  const permission = usePermission<Action, TicketContext>();
  permission.can("ticket.read", { ticketId: "t-1" });
  // permission.can("ticket.delete", { ticketId: "t-1" }); // TypeScript error
  return null;
}
```

`PermissionProvider`, `PermissionProviderProps`, `PermissionGuard`, and `PermissionGuardProps` likewise accept `TAction`, `TResource`, and (where relevant) role, claim, and user generics. In normal JSX, inference from a typed evaluator, `actions`, `rules`, and `user` is sufficient; explicit generics are available for a component's public contract.

## Security boundaries

- This is an authorization decision helper, not authentication and not a server-side security boundary. Enforce permissions again at the trusted API/data boundary.
- Default is deny: no matching rule, missing role/claim, predicate failure, predicate exception, and unknown action all deny.
- Deny rules have explicit priority over every allow rule. Evaluation does not stop at an allow, so a later matching deny is still effective.
- Wildcards are deliberately narrow: only `*` and a terminal, dot-delimited namespace wildcard such as `ticket.*` are valid. `ticket*`, `*.update`, embedded `*`, and wildcard-looking request actions never match.
- Predicates are ordinary functions supplied by the application. The package never evaluates strings as code, interprets expressions, fetches data, or runs `eval`/`new Function`. Predicate exceptions become `predicate_error` and deny.
- Debug traces contain only rule IDs, effects, match flags, and reason codes. They never copy user, claims, resource, predicate, or exception data. Keep policy IDs non-sensitive as a further operational precaution.
- Policy snapshots and result/trace containers are frozen. The evaluator does not mutate user or resource objects; predicates should also be pure and side-effect free.

For the recommended React application setup and cross-package conventions, see
the [integration guide](../docs/integration.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](../LICENSE)
