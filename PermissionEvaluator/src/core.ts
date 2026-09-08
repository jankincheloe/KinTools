/** A record of claims used by a principal. Values are intentionally opaque to the evaluator. */
export type ClaimsRecord = Readonly<Record<string, unknown>>;

export type PermissionUser<TRole extends string = string, TClaims extends object = ClaimsRecord> = {
  readonly roles?: readonly TRole[];
  readonly claims?: Readonly<TClaims>;
};

export type WildcardAction = "*" | `${string}.*`;
export type ActionPattern<TAction extends string> = TAction | WildcardAction;

export type PermissionReason =
  | "allowed"
  | "explicit_deny"
  | "unknown_action"
  | "no_matching_rule"
  | "missing_role"
  | "claim_mismatch"
  | "resource_predicate_failed"
  | "condition_failed"
  | "predicate_error"
  | "invalid_wildcard";

export type PermissionEvaluationContext<
  TAction extends string,
  TUser,
  TResource,
  TClaims extends object,
> = {
  readonly user: TUser;
  readonly action: TAction;
  /** The caller-supplied resource/context object. */
  readonly resource: TResource | undefined;
  /** Alias for resource, useful when a rule governs a context containing multiple resources. */
  readonly context: TResource | undefined;
  readonly claims: Readonly<TClaims>;
};

export type PermissionPredicate<TAction extends string, TUser, TResource, TClaims extends object> = (
  context: PermissionEvaluationContext<TAction, TUser, TResource, TClaims>,
) => boolean;

export type ResourcePredicate<TAction extends string, TUser, TResource, TClaims extends object> = (
  resource: TResource | undefined,
  context: PermissionEvaluationContext<TAction, TUser, TResource, TClaims>,
) => boolean;

export type PermissionRule<
  TAction extends string = string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
> = {
  readonly id?: string;
  readonly effect: "allow" | "deny";
  readonly action: ActionPattern<TAction>;
  /** Any one of these roles is sufficient. An omitted role list means all roles. */
  readonly roles?: readonly TRole[];
  /** All listed claims must equal the principal's claim value using Object.is. */
  readonly claims?: Readonly<Partial<Record<keyof TClaims & string, unknown>>>;
  readonly resource?: ResourcePredicate<TAction, TUser, TResource, TClaims>;
  readonly when?: PermissionPredicate<TAction, TUser, TResource, TClaims>;
  /** Alias for when, provided for policy authors who use ABAC terminology. */
  readonly condition?: PermissionPredicate<TAction, TUser, TResource, TClaims>;
};

export type PermissionTraceEntry = Readonly<{
  /** Rule identifiers only; no principal, claim, resource, or predicate data is retained. */
  readonly ruleId?: string;
  readonly effect?: "allow" | "deny";
  readonly matched: boolean;
  readonly reason: PermissionReason;
}>;

export type PermissionEvaluation<TAction extends string = string> = Readonly<{
  readonly allowed: boolean;
  readonly action: TAction | string;
  readonly reason: PermissionReason;
  readonly ruleId?: string;
  readonly trace?: readonly PermissionTraceEntry[];
}>;

export type EvaluateOptions = Readonly<{ trace?: boolean }>;

export type PermissionEvaluatorOptions<
  TAction extends string = string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
> = {
  readonly rules: readonly PermissionRule<TAction, TRole, TClaims, TResource, TUser>[];
  /** Runtime allow-list used to distinguish unknown actions from a known action with no rule. */
  readonly actions?: readonly TAction[];
  /** Alias for actions. If both are supplied, actions takes precedence. */
  readonly knownActions?: readonly TAction[];
};

export type PermissionEvaluator<
  TAction extends string = string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
> = Readonly<{
  evaluate: (
    user: TUser,
    action: TAction,
    resource?: TResource,
    options?: EvaluateOptions,
  ) => PermissionEvaluation<TAction>;
  can: (user: TUser, action: TAction, resource?: TResource, options?: EvaluateOptions) => boolean;
  cannot: (user: TUser, action: TAction, resource?: TResource, options?: EvaluateOptions) => boolean;
}>;

type InternalRule<TAction extends string, TRole extends string, TClaims extends object, TResource, TUser extends PermissionUser<TRole, TClaims>> =
  PermissionRule<TAction, TRole, TClaims, TResource, TUser> & { readonly action: string };

function isValidPattern(pattern: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return true;
  return pattern.endsWith(".*") && pattern.indexOf("*") === pattern.length - 1 && pattern.length > 2;
}

function matchesAction(pattern: string, action: string): boolean {
  if (!isValidPattern(pattern)) return false;
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return action.startsWith(pattern.slice(0, -1));
  return pattern === action;
}

function freezeRule<T extends object>(rule: T): T {
  const copy: Record<string, unknown> = { ...(rule as Record<string, unknown>) };
  if (Array.isArray(copy.roles)) copy.roles = Object.freeze([...copy.roles]);
  if (copy.claims && typeof copy.claims === "object") copy.claims = Object.freeze({ ...(copy.claims as object) });
  return Object.freeze(copy) as T;
}

function claimRequirementsMatch<TClaims extends object>(
  requirements: Readonly<Partial<Record<keyof TClaims & string, unknown>>> | undefined,
  claims: Readonly<TClaims>,
): boolean {
  if (!requirements) return true;
  const claimValues = claims as Record<string, unknown>;
  const requiredValues = requirements as Record<string, unknown>;
  for (const key of Object.keys(requirements)) {
    if (!Object.is(claimValues[key], requiredValues[key])) return false;
  }
  return true;
}

function safePredicate(run: () => boolean): "true" | "false" | "error" {
  try {
    return run() ? "true" : "false";
  } catch {
    return "error";
  }
}

export function createPermissionEvaluator<
  TAction extends string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
>(options: PermissionEvaluatorOptions<TAction, TRole, TClaims, TResource, TUser>): PermissionEvaluator<TAction, TRole, TClaims, TResource, TUser> {
  const rules = Object.freeze(options.rules.map((rule) => freezeRule(rule as object) as InternalRule<TAction, TRole, TClaims, TResource, TUser>));
  const configuredActions = options.actions ?? options.knownActions;
  const actions = configuredActions ? new Set<string>(configuredActions) : undefined;

  const evaluate = (
    user: TUser,
    action: TAction,
    resource?: TResource,
    evaluateOptions?: EvaluateOptions,
  ): PermissionEvaluation<TAction> => {
    const trace: PermissionTraceEntry[] = [];
    const addTrace = (entry: PermissionTraceEntry) => {
      if (evaluateOptions?.trace) trace.push(Object.freeze({ ...entry }));
    };
    const claims = (user.claims ?? {}) as Readonly<TClaims>;
    const context: PermissionEvaluationContext<TAction, TUser, TResource, TClaims> = Object.freeze({
      user,
      action,
      resource,
      context: resource,
      claims,
    });

    if (typeof action !== "string" || (actions && !actions.has(action))) {
      addTrace({ matched: false, reason: "unknown_action" });
      return Object.freeze({ allowed: false, action: action as string, reason: "unknown_action", ...(evaluateOptions?.trace ? { trace: Object.freeze(trace) } : {}) });
    }

    let matchedAllow = false;
    let matchedAllowId: string | undefined;
    let failureReason: PermissionReason | undefined;
    for (const rule of rules) {
      if (!isValidPattern(rule.action)) {
        addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: "invalid_wildcard" });
        continue;
      }
      if (!matchesAction(rule.action, action)) {
        addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: "no_matching_rule" });
        continue;
      }
      const roles = user.roles ?? [];
      if (rule.roles && !rule.roles.some((role) => roles.includes(role))) {
        failureReason ??= "missing_role";
        addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: "missing_role" });
        continue;
      }
      if (!claimRequirementsMatch(rule.claims, claims)) {
        failureReason ??= "claim_mismatch";
        addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: "claim_mismatch" });
        continue;
      }
      if (rule.resource) {
        const result = safePredicate(() => rule.resource?.(resource, context) ?? false);
        if (result !== "true") {
          failureReason ??= result === "error" ? "predicate_error" : "resource_predicate_failed";
          addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: result === "error" ? "predicate_error" : "resource_predicate_failed" });
          continue;
        }
      }
      const condition = rule.when ?? rule.condition;
      if (condition) {
        const result = safePredicate(() => condition(context));
        if (result !== "true") {
          failureReason ??= result === "error" ? "predicate_error" : "condition_failed";
          addTrace({ ruleId: rule.id, effect: rule.effect, matched: false, reason: result === "error" ? "predicate_error" : "condition_failed" });
          continue;
        }
      }
      addTrace({ ruleId: rule.id, effect: rule.effect, matched: true, reason: rule.effect === "deny" ? "explicit_deny" : "allowed" });
      if (rule.effect === "deny") {
        return Object.freeze({ allowed: false, action, reason: "explicit_deny", ...(rule.id === undefined ? {} : { ruleId: rule.id }), ...(evaluateOptions?.trace ? { trace: Object.freeze(trace) } : {}) });
      }
      matchedAllow = true;
      matchedAllowId ??= rule.id;
    }
    if (matchedAllow) return Object.freeze({ allowed: true, action, reason: "allowed", ...(matchedAllowId === undefined ? {} : { ruleId: matchedAllowId }), ...(evaluateOptions?.trace ? { trace: Object.freeze(trace) } : {}) });
    return Object.freeze({ allowed: false, action, reason: failureReason ?? "no_matching_rule", ...(evaluateOptions?.trace ? { trace: Object.freeze(trace) } : {}) });
  };
  const evaluator = {
    evaluate,
    can: (user: TUser, action: TAction, resource?: TResource, evaluateOptions?: EvaluateOptions) => evaluate(user, action, resource, evaluateOptions).allowed,
    cannot: (user: TUser, action: TAction, resource?: TResource, evaluateOptions?: EvaluateOptions) => !evaluate(user, action, resource, evaluateOptions).allowed,
  };
  return Object.freeze(evaluator);
}

/** Evaluate against a one-off rule set without retaining mutable policy state. */
export function evaluate<
  TAction extends string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
>(user: TUser, action: TAction, resource: TResource | undefined, options: PermissionEvaluatorOptions<TAction, TRole, TClaims, TResource, TUser> & EvaluateOptions): PermissionEvaluation<TAction>;
export function evaluate<
  TAction extends string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
>(user: TUser, action: TAction, resource: TResource | undefined, options: PermissionEvaluatorOptions<TAction, TRole, TClaims, TResource, TUser>): PermissionEvaluation<TAction>;
export function evaluate(user: PermissionUser, action: string, resource: unknown, options: PermissionEvaluatorOptions & EvaluateOptions): PermissionEvaluation {
  const { trace, ...evaluatorOptions } = options;
  return createPermissionEvaluator(evaluatorOptions).evaluate(user, action, resource, { trace });
}

export function can<TAction extends string, TRole extends string = string, TClaims extends object = ClaimsRecord, TResource = unknown, TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>>(
  user: TUser,
  action: TAction,
  resource: TResource | undefined,
  options: PermissionEvaluatorOptions<TAction, TRole, TClaims, TResource, TUser>,
): boolean {
  return evaluate(user, action, resource, options).allowed;
}

export function cannot<TAction extends string, TRole extends string = string, TClaims extends object = ClaimsRecord, TResource = unknown, TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>>(
  user: TUser,
  action: TAction,
  resource: TResource | undefined,
  options: PermissionEvaluatorOptions<TAction, TRole, TClaims, TResource, TUser>,
): boolean {
  return !can(user, action, resource, options);
}
