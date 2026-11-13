import { createPublicKey, verify } from "node:crypto";

/** DER SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const P = (1n << 255n) - 19n;

/**
 * y-coordinates of the small-order Ed25519 points (orders 1, 2, 4, 8), matched whatever the sign
 * bit. Derived from libsodium's `has_small_order` blocklist: read each canonical encoding as a
 * little-endian integer and clear bit 255. Gives 0 (order 4), 1 (identity), P-1 (order 2) and the
 * two order-8 y values from 26e8958f...fc05 and c7176a70...037a. Verified by multiplying each
 * point by its order to reach the identity.
 */
const SMALL_ORDER_Y: ReadonlySet<bigint> = new Set([
  0n,
  1n,
  P - 1n,
  0x05fc536d880238b13933c6d305acdfd5f098eff289f4c345b027b2c28f95e826n,
  0x7a03ac9277fdc74ec6cc392cfa53202a0f67100d760b3cba4fd84d3d706a17c7n,
]);

function readY(publicKey: Uint8Array): bigint {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(publicKey[i] ?? 0);
  return y & ((1n << 255n) - 1n);
}

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
  // Non-canonical keys (y >= P) are never produced by wallets; small-order keys verify trivial
  // signatures for any message, so both are rejected before node:crypto sees them.
  const y = readY(publicKey);
  if (y >= P || SMALL_ORDER_Y.has(y)) return false;
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
