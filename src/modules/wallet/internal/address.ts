import { ValidationError } from "@/modules/shared";
import { decodeBase58 } from "./base58";

declare const solanaAddressBrand: unique symbol;
/** A base58 string that decodes to exactly 32 bytes. Only parseSolanaAddress produces one. */
export type SolanaAddress = string & { readonly [solanaAddressBrand]: true };

/** Base58 alphabet (no 0, O, I, l); 32 bytes encode to 32-44 characters. */
export const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** 64 bytes encode to 64-88 characters. */
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const PUBLIC_KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

function decodeExact(value: unknown, pattern: RegExp, bytes: number): Uint8Array | null {
  if (typeof value !== "string" || !pattern.test(value)) return null;
  const decoded = decodeBase58(value);
  return decoded !== null && decoded.length === bytes ? decoded : null;
}

/** @throws ValidationError (VALIDATION_FAILED) unless value is base58 decoding to 32 bytes */
export function parseSolanaAddress(value: unknown): SolanaAddress {
  if (decodeExact(value, ADDRESS_PATTERN, PUBLIC_KEY_BYTES) === null) {
    throw new ValidationError({ message: "invalid Solana address" });
  }
  return value as SolanaAddress;
}

/** @throws ValidationError (VALIDATION_FAILED) unless value is base58 decoding to 64 bytes */
export function parseSignature(value: unknown): Uint8Array {
  const decoded = decodeExact(value, SIGNATURE_PATTERN, SIGNATURE_BYTES);
  if (decoded === null) throw new ValidationError({ message: "invalid signature encoding" });
  return decoded;
}

/** Decodes an already-parsed address. Never throws; a corrupt value yields an empty array. */
export function addressToPublicKey(address: SolanaAddress): Uint8Array {
  return decodeBase58(address) ?? new Uint8Array(0);
}
