import { Component, type ErrorInfo, type ReactNode } from "react";

import { normalizeError, type AppError, type NormalizeErrorOptions } from "./core.js";

export type ErrorBoundaryProps = {
  children?: ReactNode;
  fallback?: ReactNode | ((error: AppError, retry: () => void) => ReactNode);
  onError?: (error: AppError, info: ErrorInfo) => void;
  normalizeOptions?: NormalizeErrorOptions;
};

export type ErrorBoundaryState = { error: AppError | null };

/** A minimal boundary that delegates all visible copy and styling to callers. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const appError = normalizeError(error, this.props.normalizeOptions);
    this.setState({ error: appError });
    this.props.onError?.(appError, info);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (typeof this.props.fallback === "function") return this.props.fallback(this.state.error, this.retry);
    return this.props.fallback ?? null;
  }
}

export type RetryRenderProps = {
  error: AppError;
  retry: () => void;
};

export type RetryProps = {
  error: AppError;
  onRetry: () => void;
  fallback?: ReactNode;
  children?: (props: RetryRenderProps) => ReactNode;
};

/** Render-prop/fallback adapter. It supplies no product text or styles. */
export function Retry({ error, onRetry, fallback, children }: RetryProps): ReactNode {
  if (children) return children({ error, retry: onRetry });
  return fallback ?? null;
}
