import type { SolanaNetwork } from "@/modules/validation";
import type { SignPreview } from "./flow";

// Mirrors the 02a sign-in message layout (src/modules/wallet/internal/sign-in-message.ts).
// wallet-connect may not import @/modules/wallet, so these constants are duplicated here.
const LINE_COUNT = 11;
const HEADER_SUFFIX = " wants you to sign in with your Solana account:";
const STATEMENTS: readonly string[] = [
  "Sign in to GHOST WIRE. This does not authorize any transaction or move funds.",
  "Link this wallet to your GHOST WIRE account. This does not authorize any transaction or move funds.",
];
const NONCE_PATTERN = /^Nonce: [A-Za-z0-9_-]{22}$/;

/** True when the value is an ISO-8601 timestamp that toISOString() reproduces exactly. */
function isRoundTripIso(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/**
 * Reads the 02a sign-in or link message (ADR-0006 layout, "\n" line endings, no trailing
 * newline) and returns the preview, or null unless the message matches that exact layout for
 * the expected domain, address and network. Checks: no CR anywhere; exactly 11 lines; line 0 is
 * `${domain} wants you to sign in with your Solana account:`; line 1 is the address; lines 2 and
 * 4 are empty; line 3 is one of the two statements; line 5 is `URI: http://${domain}` or
 * `URI: https://${domain}`; line 6 is `Version: 1`; line 7 is `Chain ID: solana:${network}`; line
 * 8 is a `Nonce:` line with 22 base64url characters; lines 9 and 10 are `Issued At: ` and
 * `Expiration Time: ` followed by an ISO timestamp that round-trips through toISOString(). Defense
 * in depth: never show or sign a message that names another domain, account or network.
 */
export function parseChallengePreview(
  message: string,
  expected: {
    readonly domain: string;
    readonly address: string;
    readonly network: SolanaNetwork;
  },
): SignPreview | null {
  if (message.includes("\r")) return null;
  const lines = message.split("\n");
  if (lines.length !== LINE_COUNT) return null;
  if (lines[0] !== `${expected.domain}${HEADER_SUFFIX}`) return null;
  if (lines[1] !== expected.address) return null;
  if (lines[2] !== "" || lines[4] !== "") return null;
  if (!STATEMENTS.includes(lines[3] ?? "")) return null;
  if (
    lines[5] !== `URI: http://${expected.domain}` &&
    lines[5] !== `URI: https://${expected.domain}`
  ) {
    return null;
  }
  if (lines[6] !== "Version: 1") return null;
  if (lines[7] !== `Chain ID: solana:${expected.network}`) return null;
  if (!NONCE_PATTERN.test(lines[8] ?? "")) return null;
  const issuedAt = (lines[9] ?? "").startsWith("Issued At: ") ? (lines[9] ?? "").slice(11) : null;
  const expiresAt = (lines[10] ?? "").startsWith("Expiration Time: ")
    ? (lines[10] ?? "").slice(17)
    : null;
  if (issuedAt === null || !isRoundTripIso(issuedAt)) return null;
  if (expiresAt === null || !isRoundTripIso(expiresAt)) return null;
  return { domain: expected.domain, address: expected.address, network: expected.network };
}
