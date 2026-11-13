import { describe, expect, it } from "vitest";
import { checkOrigin } from "@/modules/security";
import { ForbiddenOriginError } from "@/modules/shared";

const APP = "https://ghostwire.test";

function request(method: string, origin?: string): Request {
  const headers = origin === undefined ? undefined : { origin };
  return new Request(`${APP}/api/v1/x`, { method, headers });
}

describe("checkOrigin", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("lets %s through without an Origin", (method) => {
    expect(() => checkOrigin(request(method), APP)).not.toThrow();
    expect(() => checkOrigin(request(method, "https://evil.test"), APP)).not.toThrow();
  });

  it.each(["POST", "DELETE", "PUT", "PATCH"])("rejects %s with no Origin", (method) => {
    expect(() => checkOrigin(request(method), APP)).toThrow(ForbiddenOriginError);
  });

  it.each([
    "https://evil.test",
    "https://ghostwire.test/",
    "http://ghostwire.test",
    "https://ghostwire.test:443",
    "https://GHOSTWIRE.test",
    "null",
  ])("rejects a POST from Origin %s", (origin) => {
    expect(() => checkOrigin(request("POST", origin), APP)).toThrow(ForbiddenOriginError);
  });

  it("accepts a POST or DELETE whose Origin matches exactly", () => {
    expect(() => checkOrigin(request("POST", APP), APP)).not.toThrow();
    expect(() => checkOrigin(request("DELETE", APP), APP)).not.toThrow();
  });
});
