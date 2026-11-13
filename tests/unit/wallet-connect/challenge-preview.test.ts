import { describe, expect, it } from "vitest";
import { buildSignInMessage, parseSolanaAddress, type SolanaAddress } from "@/modules/wallet";
import { parseChallengePreview } from "@/modules/wallet-connect";
import { createTestWallet } from "../../helpers/ed25519";

const wallet = createTestWallet();
const address = parseSolanaAddress(wallet.address) as SolanaAddress;
const EXPECTED = { domain: "ghostwire.test", address: wallet.address, network: "devnet" } as const;

function message(overrides: { domain?: string; network?: "devnet" | "mainnet-beta" } = {}) {
  return buildSignInMessage({
    purpose: "signin",
    domain: overrides.domain ?? "ghostwire.test",
    address,
    uri: "https://ghostwire.test",
    network: overrides.network ?? "devnet",
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    issuedAt: new Date("2026-11-13T10:00:00.000Z"),
    expiresAt: new Date("2026-11-13T10:05:00.000Z"),
  });
}

describe("parseChallengePreview", () => {
  it("accepts a real 02a message and returns the preview", () => {
    expect(parseChallengePreview(message(), EXPECTED)).toEqual(EXPECTED);
  });

  it("accepts the link message layout too", () => {
    const link = message().replace(
      "Sign in to GHOST WIRE.",
      "Link this wallet to your GHOST WIRE account.",
    );
    expect(parseChallengePreview(link, EXPECTED)).toEqual(EXPECTED);
  });

  it.each([
    ["another domain", message({ domain: "evil.test" })],
    ["another network", message({ network: "mainnet-beta" })],
    ["another address", message().replace(wallet.address, createTestWallet().address)],
    ["no Chain ID line", message().replace("Chain ID: solana:devnet\n", "")],
    ["CRLF line endings", message().replaceAll("\n", "\r\n")],
    ["an empty string", ""],
  ])("rejects %s", (_label, text) => {
    expect(parseChallengePreview(text, EXPECTED)).toBeNull();
  });
});
