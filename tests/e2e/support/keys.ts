import { generateKeyPairSync } from "node:crypto";
import bs58 from "bs58";

/** Plain arrays, so the key survives page.addInitScript's JSON serialization. */
export interface E2eKey {
  readonly address: string;
  readonly publicKey: number[];
  readonly pkcs8: number[];
}

/** A fresh Ed25519 key; address = bs58 of the raw 32-byte public key. In memory only. */
export function createE2eKey(): E2eKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("ed25519 JWK export has no x");
  const raw = Buffer.from(jwk.x, "base64url");
  return {
    address: bs58.encode(raw),
    publicKey: [...raw],
    pkcs8: [...privateKey.export({ format: "der", type: "pkcs8" })],
  };
}
