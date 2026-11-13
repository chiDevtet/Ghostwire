import { SOLANA_NETWORK_IDS, type SolanaNetwork } from "@/modules/validation";
import { ADDRESS_PATTERN, type SolanaAddress } from "./address";

export type SignInPurpose = "signin" | "link";

export interface SignInMessageFields {
  /** Selects the statement line. */
  readonly purpose: SignInPurpose;
  /** new URL(APP_ORIGIN).host */
  readonly domain: string;
  readonly address: SolanaAddress;
  /** APP_ORIGIN */
  readonly uri: string;
  readonly network: SolanaNetwork;
  /** 22-character base64url (16 random bytes). */
  readonly nonce: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

const STATEMENTS: Readonly<Record<SignInPurpose, string>> = {
  signin: "Sign in to GHOST WIRE. This does not authorize any transaction or move funds.",
  link: "Link this wallet to your GHOST WIRE account. This does not authorize any transaction or move funds.",
};

const HEADER_SUFFIX = " wants you to sign in with your Solana account:";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const NO_WHITESPACE = /^\S+$/;
const LINE_COUNT = 11;

/** Exact spec §5.1 layout: "\n" line endings, no trailing newline. Pure. */
export function buildSignInMessage(fields: SignInMessageFields): string {
  return [
    `${fields.domain}${HEADER_SUFFIX}`,
    fields.address,
    "",
    STATEMENTS[fields.purpose],
    "",
    `URI: ${fields.uri}`,
    "Version: 1",
    `Chain ID: solana:${fields.network}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt.toISOString()}`,
    `Expiration Time: ${fields.expiresAt.toISOString()}`,
  ].join("\n");
}

function after(line: string, prefix: string): string | null {
  return line.startsWith(prefix) ? line.slice(prefix.length) : null;
}

function purposeOf(statement: string): SignInPurpose | null {
  if (statement === STATEMENTS.signin) return "signin";
  if (statement === STATEMENTS.link) return "link";
  return null;
}

function networkOf(value: string | null): SolanaNetwork | null {
  return SOLANA_NETWORK_IDS.find((network) => network === value) ?? null;
}

/** Only an ISO-8601 UTC timestamp with milliseconds that round-trips through toISOString(). */
function isoDate(value: string | null): Date | null {
  if (value === null) return null;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value ? date : null;
}

/**
 * Inverse of buildSignInMessage. Returns null for any deviation: a CR anywhere, a line count
 * other than 11, an unknown statement, non-empty separator lines, Version other than 1, a Chain ID
 * that is not solana:<known network>, an address or nonce that fails its pattern, or timestamps
 * that do not round-trip. Invariant: parseSignInMessage(buildSignInMessage(f)) deep-equals f.
 */
export function parseSignInMessage(text: string): SignInMessageFields | null {
  if (text.includes("\r")) return null;
  const lines = text.split("\n");
  if (lines.length !== LINE_COUNT) return null;
  const line = (index: number): string => lines[index] ?? "";

  const domain = line(0).endsWith(HEADER_SUFFIX) ? line(0).slice(0, -HEADER_SUFFIX.length) : "";
  const address = line(1);
  const purpose = purposeOf(line(3));
  const uri = after(line(5), "URI: ");
  const network = networkOf(after(line(7), "Chain ID: solana:"));
  const nonce = after(line(8), "Nonce: ");
  const issuedAt = isoDate(after(line(9), "Issued At: "));
  const expiresAt = isoDate(after(line(10), "Expiration Time: "));

  if (!NO_WHITESPACE.test(domain) || !ADDRESS_PATTERN.test(address)) return null;
  if (line(2) !== "" || line(4) !== "" || line(6) !== "Version: 1") return null;
  if (purpose === null || uri === null || !NO_WHITESPACE.test(uri) || network === null) return null;
  if (nonce === null || !NONCE_PATTERN.test(nonce) || issuedAt === null || expiresAt === null) {
    return null;
  }
  return {
    purpose,
    domain,
    address: address as SolanaAddress,
    uri,
    network,
    nonce,
    issuedAt,
    expiresAt,
  };
}
