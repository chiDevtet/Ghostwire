import { loadConfig } from "@/modules/config";
import { parseObjectId, safeEquals, withTransaction } from "@/modules/database";
import { rateLimit, recordSecurityEvent, toSecurityReason } from "@/modules/security";
import {
  AuthFailedError,
  ConflictError,
  InternalError,
  NotFoundError,
  logger,
} from "@/modules/shared";
import {
  countActiveWallets,
  findWalletByAddress,
  findWalletForUser,
  insertWallet,
  setWalletStatus,
  toWalletView,
  type SolanaAddress,
  type SolanaNetwork,
  type WalletDoc,
} from "@/modules/wallet";
import { checkChallenge, consumeChallenge, insertChallenge } from "./challenges";
import { sessions, users } from "./collections";
import { lastWallet, walletAlreadyLinked } from "./errors";
import { strictlyAfter } from "./guard";
import { ensureAuthReady } from "./indexes";
import { parseChallengeBody, parseVerifyBody } from "./request";
import type { AuthContext, ChallengeView, LinkResult, UnlinkResult } from "./types";

const MINUTE = 60;
const HOUR = 3600;
/** Unlink retries a write conflict on the users guard document up to 5 times (architecture §5.3). */
const UNLINK_MAX_ATTEMPTS = 5;

function isDuplicateKey(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "DUPLICATE_KEY";
}

function isWalletAlreadyLinked(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "WALLET_ALREADY_LINKED";
}

/**
 * POST /wallets/link/challenge. Same limits as sign-in under link_* keys (architecture §7 item 2).
 * @throws ValidationError (VALIDATION_FAILED | NETWORK_UNSUPPORTED), RateLimitedError, DependencyUnavailableError
 */
export async function issueLinkChallenge(body: unknown, auth: AuthContext): Promise<ChallengeView> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(
    `link_challenge:ip:${auth.ip}`,
    config.RATE_LIMIT_CHALLENGE_PER_MIN,
    MINUTE,
    auth.at,
  );
  const { address, network } = parseChallengeBody(body, config.SOLANA_NETWORKS);
  await rateLimit(
    `link_challenge:address:${address}`,
    config.RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS,
    HOUR,
    auth.at,
  );
  return insertChallenge({
    purpose: "link",
    address,
    network,
    userId: auth.session.userId,
    at: auth.at,
  });
}

interface LinkWrite {
  readonly address: SolanaAddress;
  readonly network: SolanaNetwork;
  readonly provider: string | null;
  readonly auth: AuthContext;
}

/** The link transaction, with the same outer DUPLICATE_KEY loop as sign-in. */
async function writeLink(input: LinkWrite): Promise<{ wallet: WalletDoc; created: boolean }> {
  const userId = input.auth.session.userId;
  const at = input.auth.at;
  for (let run = 1; ; run += 1) {
    try {
      return await withTransaction(async (session) => {
        const existing = await findWalletByAddress(input.address, input.network, { session });
        if (existing === null) {
          const wallet = await insertWallet(
            {
              userId,
              address: input.address,
              network: input.network,
              provider: input.provider,
              at,
            },
            { session },
          );
          return { wallet, created: true };
        }
        if (!existing.userId.equals(userId)) throw walletAlreadyLinked();
        if (existing.status === "active") return { wallet: existing, created: false };
        const wallet = await setWalletStatus(existing._id, "active", at, {
          session,
          provider: input.provider,
        });
        if (wallet === null) {
          throw new InternalError({
            code: "DATA_INTEGRITY",
            message: "wallets: wallet disappeared inside the link transaction",
          });
        }
        return { wallet, created: false };
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (run >= 2) {
        throw new InternalError({
          code: "LINK_CONFLICT",
          message: "link hit a duplicate key twice",
          cause: error,
        });
      }
    }
  }
}

/**
 * POST /wallets/link/verify. The challenge must be a link challenge of the session user.
 * New wallet -> created: true (201). Same user, disconnected -> reactivated, created: false (200).
 * Same user, active -> returned unchanged, created: false (200).
 * @throws ValidationError, AuthFailedError, ConflictError(WALLET_ALREADY_LINKED), RateLimitedError, DependencyUnavailableError
 */
export async function verifyLink(body: unknown, auth: AuthContext): Promise<LinkResult> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(`link_verify:ip:${auth.ip}`, config.RATE_LIMIT_VERIFY_PER_MIN, MINUTE, auth.at);
  const request = parseVerifyBody(body);
  const userId = auth.session.userId;
  try {
    const challenge = await consumeChallenge({
      challengeId: request.challengeId,
      purpose: "link",
      userId,
      at: auth.at,
    });
    const address = checkChallenge(challenge, request.signature, config.SOLANA_NETWORKS);
    const { wallet, created } = await writeLink({
      address,
      network: challenge.network,
      provider: request.provider,
      auth,
    });
    await recordSecurityEvent({
      type: "wallet_linked",
      severity: "info",
      userId,
      walletId: wallet._id,
      reason: null,
      at: auth.at,
    });
    return { wallet: toWalletView(wallet), created };
  } catch (error) {
    if (error instanceof AuthFailedError || isWalletAlreadyLinked(error)) {
      const reason =
        error instanceof AuthFailedError ? toSecurityReason(error.reason) : "wallet_other_account";
      logger.info("link failed", { reason, cid: request.challengeId.toHexString() });
      await recordSecurityEvent({
        type: "link_failed",
        severity: "warning",
        userId,
        walletId: null,
        reason,
        at: auth.at,
      });
    }
    throw error;
  }
}

/**
 * DELETE /wallets/:id. Disconnects the wallet and revokes the sessions created with it. Refused
 * with LAST_WALLET when it would leave zero active wallets. The transaction first writes the users
 * document (to a value that always differs from the stored one), so two concurrent unlinks for
 * one user write-conflict and the loser is retried from a fresh snapshot (it then sees the
 * updated count). Unlinking an already-disconnected own wallet
 * is a 204 no-op. Disconnecting never affects onchain assets.
 * @throws NotFoundError (malformed, nonexistent or not owned), ConflictError(LAST_WALLET), DependencyUnavailableError
 */
export async function unlinkWallet(walletId: string, auth: AuthContext): Promise<UnlinkResult> {
  const id = parseObjectId(walletId);
  if (id === null) throw new NotFoundError();
  await ensureAuthReady();
  const userId = auth.session.userId;
  const at = auth.at;
  const { changed } = await withTransaction(
    async (session) => {
      // The guard: both concurrent unlinks of one user write this document, so the second one
      // write-conflicts and is retried from a fresh snapshot.
      const user = await users.findOne(safeEquals("_id", userId), { session });
      if (user === null) throw new NotFoundError();
      await users.updateOne(
        safeEquals("_id", userId),
        { $set: { updatedAt: strictlyAfter(at, user.updatedAt) } },
        { session },
      );
      const wallet = await findWalletForUser(id, userId, { session });
      if (wallet === null) throw new NotFoundError();
      if (wallet.status === "disconnected") return { changed: false };
      if ((await countActiveWallets(userId, { session })) <= 1) throw lastWallet();
      await setWalletStatus(id, "disconnected", at, { session });
      await sessions.updateMany(
        Object.assign({}, safeEquals("userId", userId), safeEquals("walletId", id), {
          revokedAt: null,
        }),
        { $set: { revokedAt: at } },
        { session },
      );
      return { changed: true };
    },
    { maxAttempts: UNLINK_MAX_ATTEMPTS },
  );
  if (changed) {
    await recordSecurityEvent({
      type: "wallet_unlinked",
      severity: "info",
      userId,
      walletId: id,
      reason: "wallet_unlinked",
      at,
    });
  }
  return { revokedCurrent: changed && auth.session.walletId.equals(id) };
}
