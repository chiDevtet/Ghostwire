import { loadConfig } from "@/modules/config";
import { safeEquals, type ClientSession, type ObjectId } from "@/modules/database";
import { recordSecurityEvent, sha256Hex } from "@/modules/security";
import { isAppError, logger } from "@/modules/shared";
import type { SolanaNetwork } from "@/modules/wallet";
import { sessions, users, type SessionDoc } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { AuthContext, SessionResolution } from "./types";

const DAY_MS = 86_400_000;
/** lastSeenAt and expiresAt are written at most once per hour per session. */
const SLIDE_INTERVAL_MS = 3_600_000;

/** Inside the sign-in transaction only. Lifetimes come from SESSION_IDLE_DAYS / SESSION_MAX_DAYS. */
export function createSession(
  input: {
    readonly tokenHash: string;
    readonly userId: ObjectId;
    readonly walletId: ObjectId;
    readonly network: SolanaNetwork;
    readonly userAgent: string | null;
    readonly at: Date;
  },
  options: { session: ClientSession },
): Promise<SessionDoc> {
  const { SESSION_IDLE_DAYS, SESSION_MAX_DAYS } = loadConfig();
  const atMs = input.at.getTime();
  return sessions.insertOne(
    {
      tokenHash: input.tokenHash,
      userId: input.userId,
      walletId: input.walletId,
      network: input.network,
      createdAt: input.at,
      lastSeenAt: input.at,
      expiresAt: new Date(atMs + SESSION_IDLE_DAYS * DAY_MS),
      absoluteExpiresAt: new Date(atMs + SESSION_MAX_DAYS * DAY_MS),
      revokedAt: null,
      userAgent: input.userAgent,
    },
    { session: options.session },
  );
}

/**
 * null for: no token, unknown hash, revoked, expired (idle or absolute), user missing or not
 * active. On success, unless options.slide is false, slides expiresAt to
 * min(at + idle, absoluteExpiresAt), at most once per hour, with a compare-and-set on lastSeenAt
 * so concurrent requests write once. With slide: false it only reads (server components).
 */
export async function resolveSession(
  token: string | null,
  at: Date,
  options: { readonly slide?: boolean } = {},
): Promise<SessionResolution | null> {
  const slide = options.slide ?? true;
  if (token === null) return null;
  await ensureAuthReady();
  const doc = await sessions.findOne(safeEquals("tokenHash", sha256Hex(token)));
  const atMs = at.getTime();
  if (
    doc === null ||
    doc.revokedAt !== null ||
    doc.expiresAt.getTime() <= atMs ||
    doc.absoluteExpiresAt.getTime() <= atMs
  ) {
    return null;
  }
  const user = await users.findOne(safeEquals("_id", doc.userId));
  if (user === null || user.status !== "active") return null;

  let expiresAt = doc.expiresAt;
  let slid = false;
  if (slide && atMs - doc.lastSeenAt.getTime() >= SLIDE_INTERVAL_MS) {
    const { SESSION_IDLE_DAYS } = loadConfig();
    const next = new Date(
      Math.min(atMs + SESSION_IDLE_DAYS * DAY_MS, doc.absoluteExpiresAt.getTime()),
    );
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", doc._id), safeEquals("lastSeenAt", doc.lastSeenAt), {
        revokedAt: null,
      }),
      { $set: { lastSeenAt: at, expiresAt: next } },
    );
    if (result.modifiedCount === 1) {
      slid = true;
      expiresAt = next;
    }
  }
  return {
    session: {
      id: doc._id,
      userId: doc.userId,
      walletId: doc.walletId,
      network: doc.network,
      createdAt: doc.createdAt,
      expiresAt,
      absoluteExpiresAt: doc.absoluteExpiresAt,
    },
    slid,
  };
}

/** Revokes the current session. A session_revoked event is recorded only if it was active. */
export async function logout(auth: AuthContext): Promise<void> {
  await ensureAuthReady();
  const result = await sessions.updateOne(
    Object.assign(
      {},
      safeEquals("_id", auth.session.id),
      safeEquals("userId", auth.session.userId),
      { revokedAt: null },
    ),
    { $set: { revokedAt: auth.at } },
  );
  if (result.modifiedCount === 1) {
    await recordSecurityEvent({
      type: "session_revoked",
      severity: "info",
      userId: auth.session.userId,
      walletId: auth.session.walletId,
      reason: "logout",
      at: auth.at,
    });
  }
}

/**
 * Best effort, never rejects: revokes the still-active session behind `token` (any user) with
 * reason "replaced". Used by sign-in after the new session has committed. The atomic
 * revokedAt: null filter is the same mechanism logout uses. A failure logs a code only (never
 * err, so a driver error cannot leak a filter's token hash).
 */
export async function replaceSession(token: string | null, at: Date): Promise<void> {
  if (token === null) return;
  try {
    const previous = await resolveSession(token, at, { slide: false });
    if (previous === null) return;
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", previous.session.id), { revokedAt: null }),
      { $set: { revokedAt: at } },
    );
    if (result.modifiedCount === 1) {
      await recordSecurityEvent({
        type: "session_revoked",
        severity: "info",
        userId: previous.session.userId,
        walletId: previous.session.walletId,
        reason: "replaced",
        at,
      });
    }
  } catch (error) {
    logger.warn("previous session revoke failed", {
      code: isAppError(error) ? error.code : "UNKNOWN",
    });
  }
}
