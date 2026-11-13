import { createPublicKey, verify } from "node:crypto";

/** DER SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * The 8 canonical small-order Ed25519 point encodings (libsodium's `has_small_order` blocklist:
 * orders 1, 2, 4, 4, 8, 8, 8, 8). node:crypto verifies trivial signatures under these keys for any
 * message, so they must never authenticate a wallet.
 */
const SMALL_ORDER_KEYS: readonly Buffer[] = [
  "0100000000000000000000000000000000000000000000000000000000000000",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0000000000000000000000000000000000000000000000000000000000000080",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
  "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
].map((hex) => Buffer.from(hex, "hex"));

/**
 * True only for a valid Ed25519 signature of `message` by `publicKey`. Never throws: wrong
 * lengths, key bytes Node rejects, or anything else -> false.
 */
export function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  if (SMALL_ORDER_KEYS.some((bad) => bad.equals(publicKey))) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: "der",
      type: "spki",
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}
