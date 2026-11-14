import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  AuthFailedError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
  logger,
  noContent,
  noStoreJson,
  toErrorResponse,
} from "@/modules/shared";

const SENTINEL = "SENTINEL-INTERNAL-DETAIL";

describe("noStoreJson", () => {
  it("serializes the body with no-store and JSON content type", async () => {
    const res = noStoreJson({ status: "ok" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("applies status and extra headers but never drops no-store", () => {
    const res = noStoreJson(
      { a: 1 },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "max-age=60" } },
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serializes bigint values as decimal strings, nested or top level (entry gate 6)", async () => {
    const res = noStoreJson({ amount: 18446744073709551616n, nested: { list: [1n, 2] } });
    expect(await res.text()).toBe('{"amount":"18446744073709551616","nested":{"list":["1",2]}}');
    expect(await noStoreJson(5n).text()).toBe('"5"');
  });
});

describe("noContent", () => {
  it("returns 204 with no body and no-store", async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("applies extra headers, including Set-Cookie, but never drops no-store", () => {
    const res = noContent({
      headers: { "Set-Cookie": "a=; Max-Age=0", "Cache-Control": "public" },
    });
    expect(res.headers.getSetCookie()).toEqual(["a=; Max-Age=0"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

function silenceLoggerError() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

function silenceLoggerWarn() {
  return vi.spyOn(logger, "warn").mockImplementation(() => undefined);
}

function silenceLoggerDebug() {
  return vi.spyOn(logger, "debug").mockImplementation(() => undefined);
}

describe("toErrorResponse", () => {
  it.each([
    {
      error: new ValidationError({ message: SENTINEL }),
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Invalid request",
    },
    {
      error: new NotFoundError({ message: SENTINEL }),
      status: 404,
      code: "NOT_FOUND",
      message: "Not found",
    },
    {
      error: new ConflictError({ message: SENTINEL }),
      status: 409,
      code: "CONFLICT",
      message: "Conflict",
    },
    {
      error: new AuthFailedError("signature_invalid", { message: SENTINEL }),
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication failed",
    },
  ])(
    "maps $code to $status with only the safe message and logs warn { code, status } (no err)",
    async ({ error, status, code, message }) => {
      const logError = silenceLoggerError();
      const logWarn = silenceLoggerWarn();
      const res = toErrorResponse(error);
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code, message });
      expect(text).not.toContain(SENTINEL);
      expect(logWarn).toHaveBeenCalledExactlyOnceWith("request rejected", { code, status });
      expect(logError).not.toHaveBeenCalled();
    },
  );

  it("logs UNAUTHENTICATED at debug with { code, status } only", async () => {
    const logError = silenceLoggerError();
    const logWarn = silenceLoggerWarn();
    const logDebug = silenceLoggerDebug();
    const res = toErrorResponse(new UnauthenticatedError());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
    expect(logDebug).toHaveBeenCalledExactlyOnceWith("request rejected", {
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new DependencyUnavailableError("database", { message: SENTINEL }),
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
      logged: "DEPENDENCY_UNAVAILABLE",
    },
    {
      error: new InternalError({ message: SENTINEL }),
      status: 500,
      code: "INTERNAL",
      message: "Internal error",
      logged: "INTERNAL",
    },
    {
      error: new ConfigError([{ key: SENTINEL, reason: "Required" }]),
      status: 500,
      code: "INTERNAL",
      message: "Internal error",
      logged: "CONFIG_INVALID",
    },
  ])(
    "maps $logged to $status $code with only the safe message",
    async ({ error, status, code, message, logged }) => {
      const logError = silenceLoggerError();
      const res = toErrorResponse(error);
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code, message });
      expect(text).not.toContain(SENTINEL);
      expect(text).not.toContain("stack");
      expect(logError).toHaveBeenCalledWith("request failed", { err: error, code: logged });
    },
  );

  it.each([
    { label: "DATA_INTEGRITY", error: new InternalError({ code: "DATA_INTEGRITY" }) },
    { label: "INDEX_CONFLICT", error: new InternalError({ code: "INDEX_CONFLICT" }) },
    {
      label: "a custom 502",
      error: new AppError({ code: "UPSTREAM_BROKEN", httpStatus: 502, safeMessage: "Bad gateway" }),
    },
  ])(
    "collapses $label to 500 INTERNAL and logs the original code (entry gate 5)",
    async ({ error }) => {
      const logError = silenceLoggerError();
      const res = toErrorResponse(error);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ code: "INTERNAL", message: "Internal error" });
      expect(res.headers.get("retry-after")).toBeNull();
      expect(logError).toHaveBeenCalledWith("request failed", { err: error, code: error.code });
    },
  );

  it("keeps DEPENDENCY_UNAVAILABLE as a 503 with Retry-After (not collapsed)", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new DependencyUnavailableError("database"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(await res.json()).toEqual({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
    });
  });

  it("adds Retry-After only for DependencyUnavailableError", () => {
    silenceLoggerError();
    silenceLoggerWarn();
    expect(
      toErrorResponse(new DependencyUnavailableError("database")).headers.get("retry-after"),
    ).toBe("5");
    expect(toErrorResponse(new NotFoundError()).headers.get("retry-after")).toBeNull();
    expect(toErrorResponse(new InternalError()).headers.get("retry-after")).toBeNull();
  });

  it("maps RateLimitedError to 429 with Retry-After set to its seconds", async () => {
    const logError = silenceLoggerError();
    const logWarn = silenceLoggerWarn();
    const error = new RateLimitedError(42);
    const res = toErrorResponse(error);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ code: "RATE_LIMITED", message: "Too many requests" });
    expect(logWarn).toHaveBeenCalledExactlyOnceWith("request rejected", {
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("maps unknown errors and non-Error throws to a generic 500", async () => {
    const logError = silenceLoggerError();
    for (const thrown of [new Error(SENTINEL), SENTINEL, { message: SENTINEL }]) {
      const res = toErrorResponse(thrown);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code: "INTERNAL", message: "Internal error" });
      expect(text).not.toContain(SENTINEL);
    }
    expect(logError).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenLastCalledWith("request failed", {
      err: { message: SENTINEL },
      code: "INTERNAL",
    });
  });

  it("keeps cause out of the response", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new InternalError({ cause: new Error(SENTINEL) }));
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
