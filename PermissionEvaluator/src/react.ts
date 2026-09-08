import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";

import {
  createPermissionEvaluator,
  type ClaimsRecord,
  type EvaluateOptions,
  type PermissionEvaluation,
  type PermissionEvaluator,
  type PermissionRule,
  type PermissionUser,
} from "./core.js";

type AnyEvaluator = PermissionEvaluator<any, any, any, any, any>;
type ReactUserInput = PermissionUser<any, any>;
type PermissionContextValue = { readonly evaluator: AnyEvaluator; readonly user: ReactUserInput };
const PermissionReactContext = createContext<PermissionContextValue | null>(null);

export type PermissionProviderProps<
  TAction extends string = string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
> = {
  readonly evaluator?: PermissionEvaluator<TAction, TRole, TClaims, TResource, TUser>;
  readonly rules?: readonly PermissionRule<TAction, TRole, TClaims, TResource, TUser>[];
  readonly actions?: readonly TAction[];
  readonly user: TUser;
  readonly children?: ReactNode;
};

/** Supplies policy and principal state. Changing either value updates all consumers. */
export function PermissionProvider<
  TAction extends string = string,
  TRole extends string = string,
  TClaims extends object = ClaimsRecord,
  TResource = unknown,
  TUser extends PermissionUser<TRole, TClaims> = PermissionUser<TRole, TClaims>,
>({ evaluator, rules, actions, user, children }: PermissionProviderProps<TAction, TRole, TClaims, TResource, TUser>): ReactNode {
  const resolvedEvaluator = useMemo(() => {
    if (evaluator) return evaluator as AnyEvaluator;
    return createPermissionEvaluator<TAction, TRole, TClaims, TResource, TUser>({ rules: rules ?? [], actions }) as AnyEvaluator;
  }, [evaluator, rules, actions]);
  const value = useMemo<PermissionContextValue>(() => ({ evaluator: resolvedEvaluator, user }), [resolvedEvaluator, user]);
  return createElement(PermissionReactContext.Provider, { value }, children);
}

export type UsePermissionResult<TAction extends string = string, TResource = unknown> = {
  readonly evaluate: (action: TAction, resource?: TResource, options?: EvaluateOptions) => PermissionEvaluation<TAction>;
  readonly can: (action: TAction, resource?: TResource, options?: EvaluateOptions) => boolean;
  readonly cannot: (action: TAction, resource?: TResource, options?: EvaluateOptions) => boolean;
};

export function usePermission<TAction extends string = string, TResource = unknown>(): UsePermissionResult<TAction, TResource>;
export function usePermission<TAction extends string, TResource = unknown>(action: TAction, resource?: TResource, options?: EvaluateOptions): PermissionEvaluation<TAction>;
export function usePermission<TAction extends string = string, TResource = unknown>(action?: TAction, resource?: TResource, options?: EvaluateOptions): UsePermissionResult<TAction, TResource> | PermissionEvaluation<TAction> {
  const value = useContext(PermissionReactContext);
  if (!value) throw new Error("usePermission must be used within PermissionProvider");
  const api: UsePermissionResult<TAction, TResource> = useMemo(() => ({
    evaluate: (requestedAction, requestedResource, evaluateOptions) => value.evaluator.evaluate(value.user, requestedAction, requestedResource, evaluateOptions),
    can: (requestedAction, requestedResource, evaluateOptions) => value.evaluator.can(value.user, requestedAction, requestedResource, evaluateOptions),
    cannot: (requestedAction, requestedResource, evaluateOptions) => value.evaluator.cannot(value.user, requestedAction, requestedResource, evaluateOptions),
  }), [value]);
  return action === undefined ? api : api.evaluate(action, resource, options);
}

export type PermissionGuardProps<TAction extends string = string, TResource = unknown> = {
  readonly action: TAction;
  readonly resource?: TResource;
  readonly options?: EvaluateOptions;
  readonly fallback?: ReactNode;
  readonly children?: ReactNode | ((evaluation: PermissionEvaluation<TAction>) => ReactNode);
  readonly render?: (evaluation: PermissionEvaluation<TAction>) => ReactNode;
};

/** Render-prop/children/fallback adapter. It supplies no product copy or styling. */
export function PermissionGuard<TAction extends string = string, TResource = unknown>({ action, resource, options, fallback = null, children, render }: PermissionGuardProps<TAction, TResource>): ReactNode {
  const evaluation = usePermission<TAction, TResource>(action, resource, options);
  if (!evaluation.allowed) return fallback;
  if (render) return render(evaluation);
  if (typeof children === "function") return children(evaluation);
  return children ?? null;
}

export { PermissionReactContext };
