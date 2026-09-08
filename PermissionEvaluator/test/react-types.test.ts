import { usePermission, type PermissionGuardProps, type PermissionProviderProps } from "../src/react.js";

type Action = "ticket.read" | "ticket.update";
type TicketContext = { readonly ticketId: string };
type Role = "agent" | "manager";
type Claims = { readonly tenantId: string };
type User = { readonly id: string; readonly roles: readonly Role[]; readonly claims: Claims };

const permission = usePermission<Action, TicketContext>();
permission.can("ticket.read", { ticketId: "t-1" });
permission.evaluate("ticket.update");

// @ts-expect-error Actions remain the caller's string union in the hook API.
permission.can("ticket.delete", { ticketId: "t-1" });
// @ts-expect-error Resource contexts remain typed in the hook API.
permission.can("ticket.read", { wrongKey: true });

const guardProps: PermissionGuardProps<Action, TicketContext> = {
  action: "ticket.read",
  resource: { ticketId: "t-1" },
  children: (evaluation) => evaluation.allowed ? null : null,
};
void guardProps;

// @ts-expect-error Guard actions use the same action union.
const invalidGuard: PermissionGuardProps<Action, TicketContext> = { action: "ticket.delete" };
void invalidGuard;

const providerProps: PermissionProviderProps<Action, Role, Claims, TicketContext, User> = {
  user: { id: "u-1", roles: ["agent"], claims: { tenantId: "acme" } },
  actions: ["ticket.read", "ticket.update"],
  rules: [{ effect: "allow", action: "ticket.read", roles: ["agent"] }],
};
void providerProps;
