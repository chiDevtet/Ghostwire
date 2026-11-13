import { loadConfig } from "@/modules/config";
import { safeEquals, withTransaction, type ObjectId } from "@/modules/database";
import {
  randomToken,
  rateLimit,
  recordSecurityEvent,
  sha256Hex,
  toSecurityReason,
} from "@/modules/security";
import { AuthFailedError, ConflictError, InternalError, logger } from "@/modules/shared";
import {
  findWalletByAddress,
  insertWallet,
  setWalletStatus,
  touchWallet,
  type SolanaAddress,
  type SolanaNetwork,
  type WalletDoc,
} from "@/modules/wallet";
import { checkChallenge, consumeChallenge, insertChallenge } from "./challenges";
import { users } from "./collections";
import { buildSessionCookie, idleMaxAgeSeconds } from "./cookies";
import { authFailed } from "./errors";
import { strictlyAfter } from "./guard";
import { ensureAuthReady } from "./indexes";
import { parseChallengeBody, parseVerifyBody } from "./request";
import { createSession, replaceSession } from "./sessions";
import type { ChallengeView, RequestMeta, SignInResult } from "./types";

const SESSION_TOKEN_BYTES = 32;
const MINUTE = 60;
const HOUR = 3600;

function isDuplicateKey(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "DUPLICATE_KEY";
}

/**
 * POST /auth/challenge. The IP limit runs before the body is parsed, so malformed floods count.
 * @throws ValidationError (VALIDATION_FAILED | NETWORK_UNSUPPORTED), RateLimitedError, DependencyUnavailableError
 */
export async function issueChallenge(body: unknown, meta: RequestMeta): Promise<ChallengeView> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(
    `signin_challenge:ip:${meta.ip}`,
    config.RATE_LIMIT_CHALLENGE_PER_MIN,
    MINUTE,
    meta.at,
  );
  const { address, network } = parseChallengeBody(body, config.SOLANA_NETWORKS);
  await rateLimit(
    `signin_challenge:address:${address}`,
    config.RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS,
    HOUR,
    meta.at,
  );
  return insertChallenge({ purpose: "signin", address, network, userId: null, at: meta.at });
}

interface SignInWrite {
  readonly address: SolanaAddress;
  readonly network: SolanaNetwork;
  readonly provider: string | null;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly at: Date;
}

/**
 * The sign-in transaction (safe to re-run: database writes only, all with `session`). Always
 * writes the wallet doc, even when it is already active, so a concurrent unlink conflicts.
 * An outer loop of at most 2 runs retries only a DUPLICATE_KEY from a racing first sign-in.
 */
async function writeSignIn(input: SignInWrite): Promise<{ userId: ObjectId; wallet: WalletDoc }> {
  for (let run = 1; ; run += 1) {
    try {
      return await withTransaction(async (session) => {
        const existing = await findWalletByAddress(input.address, input.network, { session });
        let userId: ObjectId;
        let wallet: WalletDoc | null;
        if (existing === null) {
          const user = await users.insertOne(
            { status: "active", createdAt: input.at, updatedAt: input.at },
            { session },
          );
          userId = user._id;
          wallet = await insertWallet(
            {
              userId,
              address: input.address,
              network: input.network,
              provider: input.provider,
              at: input.at,
            },
            { session },
          );
        } else {
          const user = await users.findOne(safeEquals("_id", existing.userId), { session });
          if (user === null || user.status !== "active") throw authFailed("user_inactive");
          userId = user._id;
          wallet =
            existing.status === "disconnected"
              ? await setWalletStatus(existing._id, "active", input.at, {
                  session,
                  provider: input.provider,
                })
              : await touchWallet(existing._id, strictlyAfter(input.at, existing.updatedAt), {
                  session,
                });
          if (wallet === null) {
            throw new InternalError({
              code: "DATA_INTEGRITY",
              message: "wallets: wallet disappeared inside the sign-in transaction",
            });
          }
        }
        await createSession(
          {
            tokenHash: input.tokenHash,
            userId,
            walletId: wallet._id,
            network: input.network,
            userAgent: input.userAgent,
            at: input.at,
          },
          { session },
        );
        return { userId, wallet };
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (run >= 2) {
        throw new InternalError({
          code: "SIGNIN_CONFLICT",
          message: "sign-in hit a duplicate key twice",
          cause: error,
        });
      }
    }
  }
}

/**
 * POST /auth/verify. Consumption happens outside the transaction, so a bad signature still
 * burns the challenge. Every AuthFailedError records signin_failed with its static reason.
 * After the new session commits, the request's previous session (options.previousToken, any
 * user) is revoked best-effort with reason "replaced"; a failure there never fails sign-in.
 * @throws ValidationError, AuthFailedError, RateLimitedError, DependencyUnavailableError
 */
export async function verifySignIn(
  body: unknown,
  meta: RequestMeta,
  options: { readonly previousToken?: string | null } = {},
): Promise<SignInResult> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(`signin_verify:ip:${meta.ip}`, config.RATE_LIMIT_VERIFY_PER_MIN, MINUTE, meta.at);
  const request = parseVerifyBody(body);
  try {
    const challenge = await consumeChallenge({
      challengeId: request.challengeId,
      purpose: "signin",
      userId: null,
      at: meta.at,
    });
    const address = checkChallenge(challenge, request.signature, config.SOLANA_NETWORKS);
    const token = randomToken(SESSION_TOKEN_BYTES);
    const { userId, wallet } = await writeSignIn({
      address,
      network: challenge.network,
      provider: request.provider,
      tokenHash: sha256Hex(token),
      userAgent: meta.userAgent,
      at: meta.at,
    });
    await recordSecurityEvent({
      type: "signin_success",
      severity: "info",
      userId,
      walletId: wallet._id,
      reason: null,
      at: meta.at,
    });
    await replaceSession(options.previousToken ?? null, meta.at);
    return {
      body: {
        user: { id: userId.toHexString() },
        wallet: { id: wallet._id.toHexString(), address: wallet.address, network: wallet.network },
      },
      setCookie: buildSessionCookie(
        token,
        idleMaxAgeSeconds(config.SESSION_IDLE_DAYS),
        config.APP_ORIGIN,
      ),
    };
  } catch (error) {
    if (error instanceof AuthFailedError) {
      logger.info("auth failed", { reason: error.reason, cid: request.challengeId.toHexString() });
      await recordSecurityEvent({
        type: "signin_failed",
        severity: "warning",
        userId: null,
        walletId: null,
        reason: toSecurityReason(error.reason),
        at: meta.at,
      });
    }
    throw error;
  }
}
