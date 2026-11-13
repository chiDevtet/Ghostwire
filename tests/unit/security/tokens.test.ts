import { describe, expect, it } from "vitest";
import { randomToken, sha256Hex } from "@/modules/security";

describe("randomToken", () => {
  it("returns 43 base64url characters for 32 bytes and 22 for 16", () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("is distinct across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken(32)));
    expect(tokens.size).toBe(50);
  });

  it.each([15, 65, 0, 32.5, Number.NaN])("throws RangeError for %s bytes", (bytes) => {
    expect(() => randomToken(bytes)).toThrow(RangeError);
  });
});

describe("sha256Hex", () => {
  it("matches the FIPS 180-2 'abc' vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes UTF-8 bytes and returns 64 lowercase hex chars", () => {
    expect(sha256Hex("é")).toBe(sha256Hex("é"));
    expect(sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
