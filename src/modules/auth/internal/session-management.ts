import { parseObjectId, safeEquals } from "@/modules/database";
import { recordSecurityEvent } from "@/modules/security";
import { NotFoundError } from "@/modules/shared";
import { sessions } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { AuthContext, RevokeResult, SessionView } from "./types";

const MAX_SESSIONS_LISTED = 100;

/** Active sessions of the caller (not revoked, not expired), lastSeenAt descending, limit 100. */
export async function listSessions(auth: AuthContext): Promise<SessionView[]> {
  await ensureAuthReady();
  const docs = await sessions.find(
    Object.assign({}, safeEquals("userId", auth.session.userId), {
      revokedAt: null,
      expiresAt: { $gt: auth.at },
      absoluteExpiresAt: { $gt: auth.at },
    }),
    { limit: MAX_SESSIONS_LISTED, sort: { lastSeenAt: -1, _id: -1 } },
  );
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    current: doc._id.equals(auth.session.id),
    createdAt: doc.createdAt.toISOString(),
    lastSeenAt: doc.lastSeenAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    network: doc.network,
    userAgent: doc.userAgent,
  }));
}

/**
 * DELETE /sessions/:id. Only the caller's own sessions. Revoking an already-revoked own session
 * is a 204 no-op. A session_revoked event (reason user_revoked) is recorded only when the session
 * was active before.
 * @throws NotFoundError when the id is malformed, nonexistent or owned by another user
 */
export async function revokeSession(sessionId: string, auth: AuthContext): Promise<RevokeResult> {
  const id = parseObjectId(sessionId);
  if (id === null) throw new NotFoundError();
  await ensureAuthReady();
  const owned = Object.assign({}, safeEquals("_id", id), safeEquals("userId", auth.session.userId));
  const before = await sessions.findOne(owned);
  if (before === null) throw new NotFoundError();
  const result = await sessions.updateOne(Object.assign({}, owned, { revokedAt: null }), {
    $set: { revokedAt: auth.at },
  });
  if (result.matchedCount === 1) {
    await recordSecurityEvent({
      type: "session_revoked",
      severity: "info",
      userId: auth.session.userId,
      walletId: before.walletId,
      reason: "user_revoked",
      at: auth.at,
    });
  }
  return { revokedCurrent: id.equals(auth.session.id) };
}
