import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/csp";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

describe("buildContentSecurityPolicy", () => {
  it("builds the exact production policy", () => {
    expect(buildContentSecurityPolicy(NONCE, { dev: false })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; ` +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; " +
        "form-action 'self'",
    );
  });

  it("adds 'unsafe-eval' to script-src only in development", () => {
    const dev = buildContentSecurityPolicy(NONCE, { dev: true });
    expect(dev).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval';`);
    const prod = buildContentSecurityPolicy(NONCE, { dev: false });
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("returns 24 base64 characters (16 bytes)", () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("is unique across 100 calls", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => createNonce()));
    expect(nonces.size).toBe(100);
  });
});
