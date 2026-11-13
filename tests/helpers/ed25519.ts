import { generateKeyPairSync, sign } from "node:crypto";
import bs58 from "bs58";

export interface TestWallet {
  /** bs58 of the raw 32-byte public key. */
  readonly address: string;
  readonly publicKey: Uint8Array;
  /** bs58 of the Ed25519 signature over the UTF-8 bytes of message. */
  sign(message: string): string;
  signBytes(message: Uint8Array): Uint8Array;
}

/** A fresh Ed25519 keypair shaped like a Solana wallet. Keys exist only in memory. */
export function createTestWallet(): TestWallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("ed25519 JWK export has no x");
  const raw = new Uint8Array(Buffer.from(jwk.x, "base64url"));
  const signBytes = (message: Uint8Array): Uint8Array =>
    new Uint8Array(sign(null, message, privateKey));
  return {
    address: bs58.encode(raw),
    publicKey: raw,
    signBytes,
    sign: (message) => bs58.encode(signBytes(new TextEncoder().encode(message))),
  };
}

export function base58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/** RFC 8032 §7.1 TEST 1-3 (hex). */
export const RFC8032_VECTORS: readonly {
  readonly name: string;
  readonly publicKey: string;
  readonly message: string;
  readonly signature: string;
}[] = [
  {
    name: "TEST 1 (empty message)",
    publicKey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    signature:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  {
    name: "TEST 2 (1 byte)",
    publicKey: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
    signature:
      "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
  {
    name: "TEST 3 (2 bytes)",
    publicKey: "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
    message: "af82",
    signature:
      "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
  },
];
