import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyEd25519 } from "@/modules/wallet";
import { RFC8032_VECTORS, createTestWallet } from "../../helpers/ed25519";

const hex = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, "hex"));
const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

function flipBit(bytes: Uint8Array, index: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[index] = (copy[index] ?? 0) ^ 0x01;
  return copy;
}

describe("verifyEd25519", () => {
  it.each(RFC8032_VECTORS)("accepts RFC 8032 §7.1 $name", ({ publicKey, message, signature }) => {
    expect(verifyEd25519(hex(publicKey), hex(message), hex(signature))).toBe(true);
  });

  it.each(RFC8032_VECTORS)("rejects $name with one signature bit flipped", (vector) => {
    const signature = flipBit(hex(vector.signature), 10);
    expect(verifyEd25519(hex(vector.publicKey), hex(vector.message), signature)).toBe(false);
  });

  it("verifies a fresh keypair and rejects any one-bit change", () => {
    const wallet = createTestWallet();
    const message = utf8("GHOST WIRE sign-in test message");
    const signature = wallet.signBytes(message);
    expect(verifyEd25519(wallet.publicKey, message, signature)).toBe(true);
    expect(verifyEd25519(wallet.publicKey, flipBit(message, 0), signature)).toBe(false);
    expect(verifyEd25519(wallet.publicKey, message, flipBit(signature, 63))).toBe(false);
  });

  it("rejects a signature from another key", () => {
    const signer = createTestWallet();
    const other = createTestWallet();
    const message = utf8("hello");
    expect(verifyEd25519(other.publicKey, message, signer.signBytes(message))).toBe(false);
  });

  it.each([
    { label: "a 31-byte key", key: new Uint8Array(31), signature: new Uint8Array(64) },
    { label: "a 33-byte key", key: new Uint8Array(33), signature: new Uint8Array(64) },
    { label: "a 63-byte signature", key: new Uint8Array(32), signature: new Uint8Array(63) },
    { label: "an empty signature", key: new Uint8Array(32), signature: new Uint8Array(0) },
    { label: "an all-0xff key", key: new Uint8Array(32).fill(0xff), signature: new Uint8Array(64) },
  ])("returns false without throwing for $label", ({ key, signature }) => {
    expect(() => verifyEd25519(key, utf8("x"), signature)).not.toThrow();
    expect(verifyEd25519(key, utf8("x"), signature)).toBe(false);
  });

  describe("small-order public keys", () => {
    const SMALL_ORDER_KEYS = [
      "0100000000000000000000000000000000000000000000000000000000000000",
      "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
      "0000000000000000000000000000000000000000000000000000000000000000",
      "0000000000000000000000000000000000000000000000000000000000000080",
      "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
      "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
      "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
      "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
    ];
    const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

    it("rejects the identity-key forgery that raw node:crypto accepts", () => {
      const identity = hex(SMALL_ORDER_KEYS[0] as string);
      // R = identity encoding, S = 0.
      const signature = new Uint8Array(64);
      signature[0] = 0x01;
      const message = utf8("any message at all");
      const key = createPublicKey({
        key: Buffer.concat([SPKI_PREFIX, identity]),
        format: "der",
        type: "spki",
      });
      expect(verify(null, message, key, signature)).toBe(true);
      expect(verifyEd25519(identity, message, signature)).toBe(false);
    });

    it.each(SMALL_ORDER_KEYS)("rejects small-order key %s", (keyHex) => {
      const signature = new Uint8Array(64);
      signature[0] = 0x01;
      expect(verifyEd25519(hex(keyHex), utf8("m"), signature)).toBe(false);
      expect(verifyEd25519(hex(keyHex), utf8("m"), new Uint8Array(64))).toBe(false);
    });
  });

  it("rejects a malleated signature with S replaced by S + L", () => {
    const L = (1n << 252n) + 27742317777372353535851937790883648493n;
    const vector = RFC8032_VECTORS[0];
    if (!vector) throw new Error("missing vector");
    const signature = hex(vector.signature);
    let s = 0n;
    for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(signature[32 + i] ?? 0);
    expect(s < L).toBe(true);
    let t = s + L;
    const malleated = new Uint8Array(signature);
    for (let i = 0; i < 32; i++) {
      malleated[32 + i] = Number(t & 0xffn);
      t >>= 8n;
    }
    expect(t).toBe(0n);
    expect(verifyEd25519(hex(vector.publicKey), hex(vector.message), malleated)).toBe(false);
  });
});
