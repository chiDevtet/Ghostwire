import { describe, expect, it } from "vitest";
import { ValidationError } from "@/modules/shared";
import { addressToPublicKey, parseSignature, parseSolanaAddress } from "@/modules/wallet";
import { base58, createTestWallet } from "../../helpers/ed25519";

function validationErrorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error("expected a ValidationError");
}

describe("parseSolanaAddress", () => {
  it("accepts a real Ed25519 public key in base58 and round-trips to its bytes", () => {
    const wallet = createTestWallet();
    const address = parseSolanaAddress(wallet.address);
    expect(address).toBe(wallet.address);
    expect(addressToPublicKey(address)).toEqual(wallet.publicKey);
  });

  it("handles leading zero bytes (leading 1s), including the all-zero key", () => {
    const zero = base58(new Uint8Array(32));
    expect(zero).toBe("11111111111111111111111111111111");
    expect(addressToPublicKey(parseSolanaAddress(zero))).toEqual(new Uint8Array(32));
    const leading = new Uint8Array(32).fill(7);
    leading[0] = 0;
    leading[1] = 0;
    const encoded = base58(leading);
    expect(encoded.startsWith("11")).toBe(true);
    expect(addressToPublicKey(parseSolanaAddress(encoded))).toEqual(leading);
  });

  it.each([
    { label: "31 bytes", value: base58(new Uint8Array(31).fill(9)) },
    { label: "33 bytes", value: base58(new Uint8Array(33).fill(9)) },
    { label: "a 64-byte signature", value: base58(new Uint8Array(64).fill(9)) },
  ])("rejects a value that decodes to $label", ({ value }) => {
    expect(validationErrorOf(() => parseSolanaAddress(value)).code).toBe("VALIDATION_FAILED");
  });

  it.each(["0", "O", "I", "l"])("rejects the non-alphabet character %s", (char) => {
    const valid = createTestWallet().address;
    const bad = `${char}${valid.slice(1)}`;
    expect(validationErrorOf(() => parseSolanaAddress(bad)).code).toBe("VALIDATION_FAILED");
  });

  it.each([
    { label: "empty", value: "" },
    { label: "whitespace-padded", value: ` ${createTestWallet().address}` },
    { label: "too long", value: "2".repeat(45) },
    { label: "a number", value: 12345 },
    { label: "null", value: null },
    { label: "an object", value: { $ne: "" } },
  ])("rejects $label input", ({ value }) => {
    expect(validationErrorOf(() => parseSolanaAddress(value)).code).toBe("VALIDATION_FAILED");
  });
});

describe("parseSignature", () => {
  it("accepts a 64-byte signature in base58 and returns its bytes", () => {
    const wallet = createTestWallet();
    const bytes = wallet.signBytes(new TextEncoder().encode("hello"));
    expect(parseSignature(base58(bytes))).toEqual(bytes);
  });

  it.each([
    { label: "63 bytes", value: base58(new Uint8Array(63).fill(5)) },
    { label: "65 bytes", value: base58(new Uint8Array(65).fill(5)) },
    { label: "a 32-byte key", value: base58(new Uint8Array(32).fill(5)) },
    { label: "a non-alphabet character", value: `0${base58(new Uint8Array(64).fill(5)).slice(1)}` },
    { label: "empty", value: "" },
    { label: "a non-string", value: ["x"] },
  ])("rejects $label", ({ value }) => {
    expect(validationErrorOf(() => parseSignature(value)).code).toBe("VALIDATION_FAILED");
  });
});
