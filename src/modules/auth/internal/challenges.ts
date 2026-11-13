import { loadConfig } from "@/modules/config";
import { randomObjectId, safeEquals, type ObjectId } from "@/modules/database";
import { randomToken, sha256Hex } from "@/modules/security";
import { ConflictError, InternalError, logger } from "@/modules/shared";
import {
  addressToPublicKey,
  buildSignInMessage,
  parseSignInMessage,
  verifyEd25519,
  type SignInPurpose,
  type SolanaAddress,
  type SolanaNetwork,
} from "@/modules/wallet";
import { challenges, type ChallengeDoc } from "./collections";
import { authFailed } from "./errors";
import type { ChallengeView } from "./types";

export const CHALLENGE_TTL_MS = 300_000;
const NONCE_BYTES = 16;

function isDuplicateKey(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "DUPLICATE_KEY";
}

/**
 * Builds the sign-in message and stores the challenge (nonce only as its hash). A nonceHash
 * collision (128 random bits, so effectively never) is retried once with a new nonce.
 * @throws InternalError("NONCE_COLLISION") on a second collision; DependencyUnavailableError
 */
export async function insertChallenge(input: {
  readonly purpose: SignInPurpose;
  readonly address: SolanaAddress;
  readonly network: SolanaNetwork;
  readonly userId: ObjectId | null;
  readonly at: Date;
}): Promise<ChallengeView> {
  const { APP_ORIGIN } = loadConfig();
  const expiresAt = new Date(input.at.getTime() + CHALLENGE_TTL_MS);
  for (let attempt = 1; ; attempt += 1) {
    const nonce = randomToken(NONCE_BYTES);
    const message = buildSignInMessage({
      purpose: input.purpose,
      domain: new URL(APP_ORIGIN).host,
      address: input.address,
      uri: APP_ORIGIN,
      network: input.network,
      nonce,
      issuedAt: input.at,
      expiresAt,
    });
    try {
      const doc = await challenges.insertOne(
        {
          nonceHash: sha256Hex(nonce),
          message,
          address: input.address,
          network: input.network,
          purpose: input.purpose,
          userId: input.userId,
          createdAt: input.at,
          expiresAt,
          consumedAt: null,
        },
        { id: randomObjectId() },
      );
      return {
        challengeId: doc._id.toHexString(),
        message,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (attempt >= 2) {
        throw new InternalError({
          code: "NONCE_COLLISION",
          message: "auth_challenges: nonceHash collided twice",
        });
      }
    }
  }
}

/**
 * Atomically consumes an unconsumed, unexpired challenge of `purpose` (and, for link, of
 * `userId`). Of two concurrent consumers exactly one matches. The challenge stays consumed
 * whatever happens next, so one challenge allows one signature attempt.
 * @throws AuthFailedError("challenge_unavailable") when nothing matches
 */
export async function consumeChallenge(input: {
  readonly challengeId: ObjectId;
  readonly purpose: SignInPurpose;
  readonly userId: ObjectId | null;
  readonly at: Date;
}): Promise<ChallengeDoc> {
  const filter = Object.assign(
    {},
    safeEquals("_id", input.challengeId),
    { purpose: input.purpose, consumedAt: null, expiresAt: { $gt: input.at } },
    input.userId === null ? {} : safeEquals("userId", input.userId),
  );
  const doc = await challenges.findOneAndUpdate(filter, { $set: { consumedAt: input.at } });
  if (doc === null) throw authFailed("challenge_unavailable");
  return doc;
}

/**
 * Checks a consumed challenge: its network is still allowed, its stored message still matches
 * the stored fields (a data-integrity signal otherwise), and the signature verifies over the
 * exact stored message bytes against the stored address.
 * @throws AuthFailedError network_unsupported | message_integrity | signature_invalid
 * @returns the parsed message address
 */
export function checkChallenge(
  doc: ChallengeDoc,
  signature: Uint8Array,
  allowed: readonly SolanaNetwork[],
): SolanaAddress {
  if (!allowed.includes(doc.network)) throw authFailed("network_unsupported");
  const fields = parseSignInMessage(doc.message);
  if (
    fields === null ||
    fields.address !== doc.address ||
    fields.network !== doc.network ||
    fields.purpose !== doc.purpose ||
    sha256Hex(fields.nonce) !== doc.nonceHash
  ) {
    logger.error("challenge message integrity check failed", { cid: doc._id.toHexString() });
    throw authFailed("message_integrity");
  }
  const message = new TextEncoder().encode(doc.message);
  if (!verifyEd25519(addressToPublicKey(fields.address), message, signature)) {
    throw authFailed("signature_invalid");
  }
  return fields.address;
}
