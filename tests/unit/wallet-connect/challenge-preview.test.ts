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

/** The real message's lines, for building one-line mutations. */
function lines(): string[] {
  return message().split("\n");
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

  describe("exact 11-line layout", () => {
    const withLines = (edit: (l: string[]) => string[]) => edit(lines()).join("\n");

    it.each([
      ["an extra trailing line", withLines((l) => [...l, "X"])],
      ["a missing line (10 lines)", withLines((l) => l.slice(0, 10))],
      [
        "a duplicate Chain ID line in place of the Nonce",
        withLines((l) => l.map((line, i) => (i === 8 ? "Chain ID: solana:devnet" : line))),
      ],
      [
        "the correct Chain ID moved to another index",
        withLines(
          (l) => [l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[8], l[7], l[9], l[10]] as string[],
        ),
      ],
      [
        "a changed statement",
        withLines((l) => l.map((line, i) => (i === 3 ? "Transfer all funds to attacker." : line))),
      ],
      [
        "a URI on another host",
        withLines((l) => l.map((line, i) => (i === 5 ? "URI: https://evil.test" : line))),
      ],
      ["Version: 2", withLines((l) => l.map((line, i) => (i === 6 ? "Version: 2" : line)))],
      ["a non-empty separator line", withLines((l) => l.map((line, i) => (i === 2 ? "x" : line)))],
      [
        "a malformed nonce",
        withLines((l) => l.map((line, i) => (i === 8 ? "Nonce: short" : line))),
      ],
      [
        "a non-round-tripping Issued At",
        withLines((l) => l.map((line, i) => (i === 9 ? "Issued At: 2026-11-13T10:00:00Z" : line))),
      ],
    ])("rejects %s", (_label, text) => {
      expect(parseChallengePreview(text, EXPECTED)).toBeNull();
    });
  });
});
