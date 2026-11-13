import bs58 from "bs58";

/**
 * The only bs58 import in src/ (architecture §1.2). Returns null instead of throwing, so every
 * caller maps a failure to one ValidationError. Callers check the alphabet and length first.
 */
export function decodeBase58(value: string): Uint8Array | null {
  return bs58.decodeUnsafe(value) ?? null;
}
