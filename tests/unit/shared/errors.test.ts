import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthFailedError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  ForbiddenOriginError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
  isAppError,
} from "@/modules/shared";

describe("AppError subclasses", () => {
  it.each([
    {
      name: "ValidationError",
      make: () => new ValidationError(),
      code: "VALIDATION_FAILED",
      status: 400,
      safe: "Invalid request",
    },
    {
      name: "NotFoundError",
      make: () => new NotFoundError(),
      code: "NOT_FOUND",
      status: 404,
      safe: "Not found",
    },
    {
      name: "ConflictError",
      make: () => new ConflictError(),
      code: "CONFLICT",
      status: 409,
      safe: "Conflict",
    },
    {
      name: "DependencyUnavailableError",
      make: () => new DependencyUnavailableError("database"),
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      safe: "Service temporarily unavailable",
    },
    {
      name: "InternalError",
      make: () => new InternalError(),
      code: "INTERNAL",
      status: 500,
      safe: "Internal error",
    },
    {
      name: "UnauthenticatedError",
      make: () => new UnauthenticatedError(),
      code: "UNAUTHENTICATED",
      status: 401,
      safe: "Authentication required",
    },
    {
      name: "ForbiddenOriginError",
      make: () => new ForbiddenOriginError(),
      code: "ORIGIN_REJECTED",
      status: 403,
      safe: "Origin not allowed",
    },
    {
      name: "RateLimitedError",
      make: () => new RateLimitedError(30),
      code: "RATE_LIMITED",
      status: 429,
      safe: "Too many requests",
    },
  ])("$name has the documented defaults", ({ name, make, code, status, safe }) => {
    const error = make();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
    expect(error.safeMessage).toBe(safe);
    expect(error.message).toBe(safe);
    expect(isAppError(error)).toBe(true);
  });

  it("lets callers override code, safeMessage and the internal message", () => {
    const error = new ConflictError({
      code: "DUPLICATE_KEY",
      safeMessage: "Resource already exists",
      message: "users: duplicate key on email",
    });
    expect(error.code).toBe("DUPLICATE_KEY");
    expect(error.safeMessage).toBe("Resource already exists");
    expect(error.message).toBe("users: duplicate key on email");
    expect(error.httpStatus).toBe(409);
  });

  it("keeps the cause", () => {
    const cause = new Error("driver detail");
    const error = new InternalError({ cause });
    expect(error.cause).toBe(cause);
  });

  it("does not define cause when none is given", () => {
    expect(Object.hasOwn(new NotFoundError(), "cause")).toBe(false);
  });

  it("DependencyUnavailableError records the dependency", () => {
    expect(new DependencyUnavailableError("database").dependency).toBe("database");
  });
});

describe("ConfigError", () => {
  const issues = [
    { key: "MONGODB_URI", reason: "Required" },
    { key: "LOG_LEVEL", reason: "Invalid option: expected one of debug|info|warn|error" },
  ];

  it("lists keys and reasons in the message", () => {
    expect(new ConfigError(issues).message).toBe(
      "Invalid configuration: MONGODB_URI (Required); LOG_LEVEL (Invalid option: expected one of debug|info|warn|error)",
    );
  });

  it("is a CONFIG_INVALID 500 with a generic safe message", () => {
    const error = new ConfigError(issues);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ConfigError");
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.httpStatus).toBe(500);
    expect(error.safeMessage).toBe("Internal error");
  });

  it("stores a frozen copy of the issues", () => {
    const error = new ConfigError(issues);
    expect(error.issues).toEqual(issues);
    expect(error.issues).not.toBe(issues);
    expect(Object.isFrozen(error.issues)).toBe(true);
  });
});

describe("isAppError", () => {
  it("is false for anything that is not an AppError", () => {
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError({ code: "X", httpStatus: 400, safeMessage: "x" })).toBe(false);
    expect(isAppError("boom")).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("AuthFailedError", () => {
  it("is a 401 AUTH_FAILED whose reason stays out of the safe message", () => {
    const error = new AuthFailedError("signature_invalid");
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AuthFailedError");
    expect(error.code).toBe("AUTH_FAILED");
    expect(error.httpStatus).toBe(401);
    expect(error.safeMessage).toBe("Authentication failed");
    expect(error.reason).toBe("signature_invalid");
    expect(error.message).toBe("auth failed: signature_invalid");
  });

  it("keeps a cause", () => {
    const cause = new Error("inner");
    expect(new AuthFailedError("user_inactive", { cause }).cause).toBe(cause);
  });
});

describe("RateLimitedError", () => {
  it.each([
    { input: 30, expected: 30 },
    { input: 1.2, expected: 2 },
    { input: 0, expected: 1 },
    { input: -5, expected: 1 },
    { input: 86_401, expected: 86_400 },
    { input: Number.NaN, expected: 1 },
    { input: Number.POSITIVE_INFINITY, expected: 1 },
  ])("normalizes retryAfterSeconds $input to $expected", ({ input, expected }) => {
    expect(new RateLimitedError(input).retryAfterSeconds).toBe(expected);
  });
});
