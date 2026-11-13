import type { SolanaNetwork } from "@/modules/validation";
import type { SignPreview } from "./flow";

const HEADER_SUFFIX = " wants you to sign in with your Solana account:";

/**
 * Reads the 02a sign-in message (ADR-0006 layout, "\n" line endings): line 0 must be
 * `${expected.domain} wants you to sign in with your Solana account:`, line 1 must equal
 * expected.address, and a line `Chain ID: solana:${expected.network}` must be present.
 * Returns the preview or null on any mismatch (a CR anywhere included). Defense in depth: never
 * show or sign a message that names another domain, account or network.
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
  if (lines[0] !== `${expected.domain}${HEADER_SUFFIX}`) return null;
  if (lines[1] !== expected.address) return null;
  if (!lines.includes(`Chain ID: solana:${expected.network}`)) return null;
  return { domain: expected.domain, address: expected.address, network: expected.network };
}
