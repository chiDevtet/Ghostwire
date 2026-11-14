import bs58 from "bs58";

/** bs58.encode. The only bs58 import in client code (lint R6). */
export function encodeBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}
