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
});
