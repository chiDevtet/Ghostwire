import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { encodeBase58 } from "@/modules/wallet-connect";

describe("encodeBase58", () => {
  it("round-trips through bs58.decode", () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 37) % 256);
    expect(bs58.decode(encodeBase58(bytes))).toEqual(bytes);
  });

  it("keeps leading zero bytes as leading 1s", () => {
    expect(encodeBase58(new Uint8Array([0, 0, 1]))).toBe("112");
  });
});
