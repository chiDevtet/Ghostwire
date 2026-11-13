import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  logger,
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

function silenceLoggerError() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

describe("toErrorResponse", () => {
  it.each([
    {
      error: new ValidationError({ message: SENTINEL }),
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Invalid request",
      logged: "VALIDATION_FAILED",
    },
    {
      error: new NotFoundError({ message: SENTINEL }),
      status: 404,
      code: "NOT_FOUND",
      message: "Not found",
      logged: "NOT_FOUND",
    },
    {
      error: new ConflictError({ message: SENTINEL }),
      status: 409,
      code: "CONFLICT",
      message: "Conflict",
      logged: "CONFLICT",
    },
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
    expect(
      toErrorResponse(new DependencyUnavailableError("database")).headers.get("retry-after"),
    ).toBe("5");
    expect(toErrorResponse(new NotFoundError()).headers.get("retry-after")).toBeNull();
    expect(toErrorResponse(new InternalError()).headers.get("retry-after")).toBeNull();
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
