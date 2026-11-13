import { describe, expect, it } from "vitest";
import {
  buildSignInMessage,
  parseSignInMessage,
  parseSolanaAddress,
  type SignInMessageFields,
} from "@/modules/wallet";

const ADDRESS = parseSolanaAddress("11111111111111111111111111111111");

const FIELDS: SignInMessageFields = {
  purpose: "signin",
  domain: "ghostwire.test",
  address: ADDRESS,
  uri: "https://ghostwire.test",
  network: "devnet",
  nonce: "AAAAAAAAAAAAAAAAAAAAAA",
  issuedAt: new Date("2026-11-13T10:00:00.000Z"),
  expiresAt: new Date("2026-11-13T10:05:00.000Z"),
};

const GOLDEN_SIGNIN = [
  "ghostwire.test wants you to sign in with your Solana account:",
  "11111111111111111111111111111111",
  "",
  "Sign in to GHOST WIRE. This does not authorize any transaction or move funds.",
  "",
  "URI: https://ghostwire.test",
  "Version: 1",
  "Chain ID: solana:devnet",
  "Nonce: AAAAAAAAAAAAAAAAAAAAAA",
  "Issued At: 2026-11-13T10:00:00.000Z",
  "Expiration Time: 2026-11-13T10:05:00.000Z",
].join("\n");

describe("buildSignInMessage", () => {
  it("produces the exact spec §5.1 bytes for sign-in", () => {
    const message = buildSignInMessage(FIELDS);
    expect(message).toBe(GOLDEN_SIGNIN);
    expect(message.endsWith("\n")).toBe(false);
    expect(message.includes("\r")).toBe(false);
  });

  it("uses the link statement for link challenges", () => {
    const message = buildSignInMessage({ ...FIELDS, purpose: "link", network: "mainnet-beta" });
    expect(message.split("\n")[3]).toBe(
      "Link this wallet to your GHOST WIRE account. This does not authorize any transaction or move funds.",
    );
    expect(message.split("\n")[7]).toBe("Chain ID: solana:mainnet-beta");
  });
});

describe("parseSignInMessage", () => {
  it.each(["signin", "link"] as const)("round-trips a %s message", (purpose) => {
    const fields = { ...FIELDS, purpose };
    expect(parseSignInMessage(buildSignInMessage(fields))).toEqual(fields);
  });

  it("round-trips an http origin with a port", () => {
    const fields = { ...FIELDS, domain: "localhost:3000", uri: "http://localhost:3000" };
    expect(parseSignInMessage(buildSignInMessage(fields))).toEqual(fields);
  });

  const replaceLine = (index: number, value: string): string => {
    const lines = GOLDEN_SIGNIN.split("\n");
    lines[index] = value;
    return lines.join("\n");
  };

  it.each([
    { label: "an altered header", text: replaceLine(0, "ghostwire.test wants you to sign in:") },
    {
      label: "an empty domain",
      text: replaceLine(0, " wants you to sign in with your Solana account:"),
    },
    { label: "an invalid address", text: replaceLine(1, "0OIl1111111111111111111111111111") },
    { label: "a non-empty separator", text: replaceLine(2, "x") },
    { label: "a wrong statement", text: replaceLine(3, "Sign in to GHOST WIRE.") },
    { label: "a URI with whitespace", text: replaceLine(5, "URI: https://ghostwire.test x") },
    { label: "a missing URI prefix", text: replaceLine(5, "https://ghostwire.test") },
    { label: "Version 2", text: replaceLine(6, "Version: 2") },
    { label: "solana:testnet", text: replaceLine(7, "Chain ID: solana:testnet") },
    { label: "a non-solana chain", text: replaceLine(7, "Chain ID: eip155:1") },
    { label: "a short nonce", text: replaceLine(8, "Nonce: AAAA") },
    {
      label: "a nonce with a non-base64url char",
      text: replaceLine(8, "Nonce: AAAAAAAAAAAAAAAAAAAAA+"),
    },
    { label: "a timestamp without ms", text: replaceLine(9, "Issued At: 2026-11-13T10:00:00Z") },
    {
      label: "an offset timestamp",
      text: replaceLine(10, "Expiration Time: 2026-11-13T11:05:00.000+01:00"),
    },
    { label: "an extra line", text: `${GOLDEN_SIGNIN}\nResources: x` },
    { label: "a trailing newline", text: `${GOLDEN_SIGNIN}\n` },
    { label: "a missing line", text: GOLDEN_SIGNIN.split("\n").slice(0, 10).join("\n") },
    { label: "CRLF line endings", text: GOLDEN_SIGNIN.split("\n").join("\r\n") },
    { label: "an empty string", text: "" },
  ])("returns null for $label", ({ text }) => {
    expect(parseSignInMessage(text)).toBeNull();
  });
});
