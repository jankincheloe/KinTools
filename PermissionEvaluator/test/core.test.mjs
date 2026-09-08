import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  can,
  cannot,
  createPermissionEvaluator,
  evaluate,
} from "../dist/core.js";

test("keeps root and core builds React-free", async () => {
  const [root, core] = await Promise.all([
    readFile(new URL("../dist/index.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/core.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(root, /(?:from|require\(['"])(?:react|react\/)/);
  assert.doesNotMatch(core, /(?:from|require\(['"])(?:react|react\/)/);
});

const actions = ["ticket.read", "ticket.update", "ticket.delete", "admin.read"];
const user = { id: "u1", roles: ["agent"], claims: { tenantId: "acme", suspended: false } };

test("deny has priority over allow and can/cannot agree", () => {
  const permissions = createPermissionEvaluator({
    actions,
    rules: [
      { id: "allow", effect: "allow", action: "ticket.*", roles: ["agent"] },
      { id: "deny", effect: "deny", action: "ticket.update", roles: ["agent"] },
    ],
  });
  const result = permissions.evaluate(user, "ticket.update");
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "explicit_deny");
  assert.equal(result.ruleId, "deny");
  assert.equal(permissions.can(user, "ticket.read"), true);
  assert.equal(permissions.cannot(user, "ticket.update"), true);
});

test("roles, claims, resource predicates, and condition predicates are all required", () => {
  const permissions = createPermissionEvaluator({
    actions,
    rules: [{
      id: "own-ticket",
      effect: "allow",
      action: "ticket.update",
      roles: ["agent"],
      claims: { suspended: false },
      resource: (resource, context) => resource?.tenantId === context.claims.tenantId && resource.assigneeId === context.user.id,
      when: (context) => context.resource?.state !== "locked",
    }],
  });
  assert.equal(permissions.can(user, "ticket.update", { tenantId: "acme", assigneeId: "u1", state: "open" }), true);
  assert.equal(permissions.evaluate({ ...user, roles: ["viewer"] }, "ticket.update", { tenantId: "acme", assigneeId: "u1", state: "open" }).reason, "missing_role");
  assert.equal(permissions.evaluate({ ...user, claims: { tenantId: "acme", suspended: true } }, "ticket.update", { tenantId: "acme", assigneeId: "u1", state: "open" }).reason, "claim_mismatch");
  assert.equal(permissions.evaluate(user, "ticket.update", { tenantId: "other", assigneeId: "u1", state: "open" }).reason, "resource_predicate_failed");
  assert.equal(permissions.evaluate(user, "ticket.update", { tenantId: "acme", assigneeId: "u1", state: "locked" }).reason, "condition_failed");
});

test("wildcards are bounded to global or dotted namespace prefixes", () => {
  const permissions = createPermissionEvaluator({
    actions,
    rules: [
      { id: "namespace", effect: "allow", action: "ticket.*", roles: ["agent"] },
      { id: "invalid", effect: "allow", action: "ticket*", roles: ["agent"] },
    ],
  });
  assert.equal(permissions.can(user, "ticket.read"), true);
  assert.equal(permissions.evaluate(user, "admin.read").reason, "no_matching_rule");
  const invalid = createPermissionEvaluator({ actions: ["ticketing.read"], rules: [{ effect: "allow", action: "ticket*" }] });
  assert.equal(invalid.evaluate(user, "ticketing.read").reason, "no_matching_rule");
  const global = createPermissionEvaluator({ actions: ["admin.read"], rules: [{ effect: "allow", action: "*" }] });
  assert.equal(global.can(user, "admin.read"), true);
});

test("unknown actions are denied and traces redact context and claims", () => {
  const secret = { password: "do-not-log", tenantId: "acme" };
  const permissions = createPermissionEvaluator({ actions, rules: [{ id: "allow-read", effect: "allow", action: "ticket.read" }] });
  const result = permissions.evaluate(user, "ticket.typo", secret, { trace: true });
  assert.equal(result.reason, "unknown_action");
  assert.equal(result.allowed, false);
  assert.ok(result.trace);
  assert.equal(JSON.stringify(result.trace).includes("do-not-log"), false);
  assert.equal(JSON.stringify(result.trace).includes("acme"), false);
});

test("policy snapshots and results are immutable", () => {
  const rule = { id: "read", effect: "allow", action: "ticket.read" };
  const policy = [rule];
  const permissions = createPermissionEvaluator({ actions, rules: policy });
  rule.effect = "deny";
  policy.length = 0;
  assert.equal(permissions.can(user, "ticket.read"), true);
  const result = permissions.evaluate(user, "ticket.read", undefined, { trace: true });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.trace), true);
});

test("standalone helpers evaluate one-off immutable policy", () => {
  const options = { actions, rules: [{ effect: "allow", action: "ticket.read" }] };
  assert.equal(can(user, "ticket.read", undefined, options), true);
  assert.equal(cannot(user, "ticket.delete", undefined, options), true);
  assert.equal(evaluate(user, "ticket.delete", undefined, options).reason, "no_matching_rule");
});
