import { createHash, randomBytes } from "node:crypto";

/** base64url of crypto.randomBytes(bytes). @throws RangeError unless bytes is an integer in [16, 64] */
export function randomToken(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new RangeError("bytes must be an integer in [16, 64]");
  }
  return randomBytes(bytes).toString("base64url");
}

/** Lowercase hex SHA-256 of the UTF-8 bytes of value. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
