import { describe, expect, it } from "vitest";
import { clientIp } from "@/modules/security";

function request(forwardedFor?: string): Request {
  const headers = forwardedFor === undefined ? undefined : { "x-forwarded-for": forwardedFor };
  return new Request("https://ghostwire.test/api/v1/x", { headers });
}

describe("clientIp", () => {
  it("returns unknown when the proxy is not trusted, even with X-Forwarded-For", () => {
    expect(clientIp(request("203.0.113.7"), false)).toBe("unknown");
    expect(clientIp(request(), false)).toBe("unknown");
  });

  it("returns the first trimmed X-Forwarded-For entry when the proxy is trusted", () => {
    expect(clientIp(request("203.0.113.7"), true)).toBe("203.0.113.7");
    expect(clientIp(request("  198.51.100.2 , 10.0.0.1"), true)).toBe("198.51.100.2");
  });

  it("accepts IPv6", () => {
    expect(clientIp(request("2001:db8::1, 10.0.0.1"), true)).toBe("2001:db8::1");
  });

  it.each(["", "not-an-ip", "203.0.113.7:8080", "999.1.1.1", ", 203.0.113.7"])(
    "returns unknown for the trusted header %j",
    (header) => {
      expect(clientIp(request(header), true)).toBe("unknown");
    },
  );

  it("returns unknown when the trusted header is missing", () => {
    expect(clientIp(request(), true)).toBe("unknown");
  });
});
