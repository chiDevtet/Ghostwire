import { z } from "zod";
import { loadConfig } from "@/modules/config";
import { parseObjectId, type ObjectId } from "@/modules/database";
import { clientIp } from "@/modules/security";
import { ValidationError, now } from "@/modules/shared";
import {
  PROVIDER_PATTERN,
  parseSignature,
  parseSolanaAddress,
  type SolanaAddress,
  type SolanaNetwork,
} from "@/modules/wallet";
import { networkUnsupported } from "./errors";
import type { RequestMeta } from "./types";

const MAX_USER_AGENT = 128;

/** Removes C0 control characters and DEL. */
function stripControl(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
}

/** Reads config (TRUST_PROXY) lazily, per call. */
export function requestMeta(request: Request): RequestMeta {
  const { TRUST_PROXY } = loadConfig();
  const raw = request.headers.get("user-agent");
  const userAgent = raw === null ? "" : stripControl(raw).slice(0, MAX_USER_AGENT);
  return {
    at: now(),
    ip: clientIp(request, TRUST_PROXY),
    userAgent: userAgent === "" ? null : userAgent,
  };
}

const challengeBody = z.strictObject({
  address: z.string().max(64),
  network: z.string().max(32),
});

const verifyBody = z.strictObject({
  challengeId: z.string().max(24),
  signature: z.string().max(128),
  provider: z.string().regex(PROVIDER_PATTERN).optional(),
});

export interface ChallengeRequest {
  readonly address: SolanaAddress;
  readonly network: SolanaNetwork;
}

export interface VerifyRequest {
  readonly challengeId: ObjectId;
  readonly signature: Uint8Array;
  readonly provider: string | null;
}

/**
 * Body of POST /auth/challenge and /wallets/link/challenge.
 * @throws ValidationError (VALIDATION_FAILED) for a malformed body or address;
 *         ValidationError (NETWORK_UNSUPPORTED) for a string network outside `allowed`
 */
export function parseChallengeBody(
  body: unknown,
  allowed: readonly SolanaNetwork[],
): ChallengeRequest {
  const parsed = challengeBody.safeParse(body);
  if (!parsed.success) throw new ValidationError({ message: "invalid challenge body" });
  const address = parseSolanaAddress(parsed.data.address);
  const network = allowed.find((candidate) => candidate === parsed.data.network);
  if (network === undefined) throw networkUnsupported();
  return { address, network };
}

/**
 * Body of POST /auth/verify and /wallets/link/verify. A well-formed but unknown challengeId is
 * not decided here (that is AUTH_FAILED at consume time).
 * @throws ValidationError (VALIDATION_FAILED) for a malformed body, challengeId, signature or provider
 */
export function parseVerifyBody(body: unknown): VerifyRequest {
  const parsed = verifyBody.safeParse(body);
  if (!parsed.success) throw new ValidationError({ message: "invalid verify body" });
  const challengeId = parseObjectId(parsed.data.challengeId);
  if (challengeId === null) throw new ValidationError({ message: "invalid challengeId" });
  return {
    challengeId,
    signature: parseSignature(parsed.data.signature),
    provider: parsed.data.provider ?? null,
  };
}
