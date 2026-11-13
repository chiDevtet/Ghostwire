export interface AppErrorInit {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;
  /** Internal, may be detailed, never sent to clients. Defaults to safeMessage. */
  readonly message?: string;
  readonly cause?: unknown;
}

export interface AppErrorOptions {
  readonly code?: string;
  readonly safeMessage?: string;
  readonly message?: string;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;

  constructor(init: AppErrorInit) {
    super(
      init.message ?? init.safeMessage,
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.name = new.target.name;
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.safeMessage = init.safeMessage;
  }
}

interface ErrorDefaults {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;
}

function initFrom(defaults: ErrorDefaults, options: AppErrorOptions): AppErrorInit {
  return {
    code: options.code ?? defaults.code,
    httpStatus: defaults.httpStatus,
    safeMessage: options.safeMessage ?? defaults.safeMessage,
    message: options.message,
    cause: options.cause,
  };
}

export class ValidationError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(
      initFrom(
        { code: "VALIDATION_FAILED", httpStatus: 400, safeMessage: "Invalid request" },
        options,
      ),
    );
  }
}

export class NotFoundError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "NOT_FOUND", httpStatus: 404, safeMessage: "Not found" }, options));
  }
}

export class ConflictError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "CONFLICT", httpStatus: 409, safeMessage: "Conflict" }, options));
  }
}

export type DependencyName = "database";

export class DependencyUnavailableError extends AppError {
  readonly dependency: DependencyName;

  constructor(dependency: DependencyName, options: AppErrorOptions = {}) {
    super(
      initFrom(
        {
          code: "DEPENDENCY_UNAVAILABLE",
          httpStatus: 503,
          safeMessage: "Service temporarily unavailable",
        },
        options,
      ),
    );
    this.dependency = dependency;
  }
}

export class InternalError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "INTERNAL", httpStatus: 500, safeMessage: "Internal error" }, options));
  }
}

export class UnauthenticatedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(
      initFrom(
        { code: "UNAUTHENTICATED", httpStatus: 401, safeMessage: "Authentication required" },
        options,
      ),
    );
  }
}

/** A failed sign-in or link proof. `reason` is a static string for logs and security events only. */
export class AuthFailedError extends AppError {
  readonly reason: string;

  constructor(reason: string, options: AppErrorOptions = {}) {
    super(
      initFrom(
        { code: "AUTH_FAILED", httpStatus: 401, safeMessage: "Authentication failed" },
        { message: `auth failed: ${reason}`, ...options },
      ),
    );
    this.reason = reason;
  }
}

export class ForbiddenOriginError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(
      initFrom(
        { code: "ORIGIN_REJECTED", httpStatus: 403, safeMessage: "Origin not allowed" },
        options,
      ),
    );
  }
}

const MAX_RETRY_AFTER_SECONDS = 86_400;

export class RateLimitedError extends AppError {
  /** Integer in [1, 86400]: Math.ceil of the input, clamped. Sent as Retry-After. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, options: AppErrorOptions = {}) {
    super(
      initFrom(
        { code: "RATE_LIMITED", httpStatus: 429, safeMessage: "Too many requests" },
        options,
      ),
    );
    const seconds = Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds) : 1;
    this.retryAfterSeconds = Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, seconds));
  }
}

export interface ConfigIssue {
  readonly key: string;
  readonly reason: string;
}

/** Startup-only. The message lists key names and static reasons; it never contains values. */
export class ConfigError extends AppError {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const frozen = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super({
      code: "CONFIG_INVALID",
      httpStatus: 500,
      safeMessage: "Internal error",
      message: `Invalid configuration: ${frozen.map((i) => `${i.key} (${i.reason})`).join("; ")}`,
    });
    this.issues = frozen;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
