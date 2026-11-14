import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

describe("proxy matcher", () => {
  const missing = config.matcher[0]?.missing ?? [];

  it("does not exempt `purpose: prefetch` document requests from the CSP", () => {
    expect(missing.some((m) => m.key === "purpose")).toBe(false);
  });

  it("still skips Next router prefetches", () => {
    expect(missing.some((m) => m.key === "next-router-prefetch")).toBe(true);
  });

  it("sets a nonce CSP on a request carrying `purpose: prefetch`", () => {
    const response = proxy(
      new NextRequest("http://localhost/", { headers: { purpose: "prefetch" } }),
    );
    expect(response.headers.get("Content-Security-Policy")).toMatch(/'nonce-[^']+'/);
  });
});
