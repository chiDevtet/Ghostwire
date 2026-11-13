import { describe, expect, it, vi } from "vitest";
import {
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
});

function silenceLoggerError() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

describe("toErrorResponse", () => {
  it.each([
    { error: new ValidationError({ message: SENTINEL }), status: 400, code: "VALIDATION_FAILED", message: "Invalid request" },
    { error: new NotFoundError({ message: SENTINEL }), status: 404, code: "NOT_FOUND", message: "Not found" },
    { error: new ConflictError({ message: SENTINEL }), status: 409, code: "CONFLICT", message: "Conflict" },
    {
      error: new DependencyUnavailableError("database", { message: SENTINEL }),
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
    },
    { error: new InternalError({ message: SENTINEL }), status: 500, code: "INTERNAL", message: "Internal error" },
    {
      error: new ConfigError([{ key: SENTINEL, reason: "Required" }]),
      status: 500,
      code: "CONFIG_INVALID",
      message: "Internal error",
    },
  ])("maps $code to $status with only the safe message", async ({ error, status, code, message }) => {
    const logError = silenceLoggerError();
    const res = toErrorResponse(error);
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code, message });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("stack");
    expect(logError).toHaveBeenCalledWith("request failed", { err: error });
  });

  it("adds Retry-After only for DependencyUnavailableError", () => {
    silenceLoggerError();
    expect(toErrorResponse(new DependencyUnavailableError("database")).headers.get("retry-after")).toBe("5");
    expect(toErrorResponse(new NotFoundError()).headers.get("retry-after")).toBeNull();
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
  });

  it("keeps cause out of the response", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new InternalError({ cause: new Error(SENTINEL) }));
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
