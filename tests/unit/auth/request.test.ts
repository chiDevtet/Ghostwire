import { afterEach, describe, expect, it } from "vitest";
import { requestMeta } from "@/modules/auth";
import { resetClockForTests } from "@/modules/shared";
import { useTestClock } from "../../helpers/clock";
import { useEnv } from "../../helpers/env";

/** Port 1: nothing listens there; requestMeta never connects anyway. */
const UNIT_ENV = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:1/?replicaSet=rs0",
  MONGODB_DB_NAME: "auth_unit",
  APP_ORIGIN: "https://ghostwire.test",
};

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  resetClockForTests();
});

function request(headers: Record<string, string>): Request {
  return new Request("https://ghostwire.test/api/v1/x", { headers });
}

describe("requestMeta", () => {
  it("takes `at` from the shared clock and ignores X-Forwarded-For without TRUST_PROXY", () => {
    restore = useEnv({ ...UNIT_ENV, TRUST_PROXY: "false" });
    useTestClock(new Date("2026-11-13T10:00:00.000Z"));
    const meta = requestMeta(request({ "x-forwarded-for": "203.0.113.7", "user-agent": "UA/1" }));
    expect(meta).toEqual({
      at: new Date("2026-11-13T10:00:00.000Z"),
      ip: "unknown",
      userAgent: "UA/1",
    });
  });

  it("uses X-Forwarded-For with TRUST_PROXY=true", () => {
    restore = useEnv({ ...UNIT_ENV, TRUST_PROXY: "true" });
    expect(requestMeta(request({ "x-forwarded-for": "203.0.113.7" })).ip).toBe("203.0.113.7");
  });

  it("strips control characters, caps the user agent at 128 chars and maps empty to null", () => {
    restore = useEnv(UNIT_ENV);
    expect(requestMeta(request({ "user-agent": `a\tb${"x".repeat(200)}` })).userAgent).toBe(
      `ab${"x".repeat(126)}`,
    );
    expect(requestMeta(request({ "user-agent": "\t" })).userAgent).toBeNull();
    expect(requestMeta(request({})).userAgent).toBeNull();
  });
});
