import { beforeEach, describe, expect, it } from "vitest";
import {
  issueChallenge,
  logout,
  resolveSession,
  verifySignIn,
  type AuthContext,
} from "@/modules/auth";
import { getDb, parseObjectId } from "@/modules/database";
import { randomToken, sha256Hex } from "@/modules/security";
import { createTestWallet } from "../../helpers/ed25519";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function signIn(): Promise<{ token: string; userId: string }> {
  const wallet = createTestWallet();
  const meta = { at: T0, ip: "unknown", userAgent: null };
  const view = await issueChallenge({ address: wallet.address, network: "devnet" }, meta);
  const result = await verifySignIn(
    { challengeId: view.challengeId, signature: wallet.sign(view.message) },
    meta,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(result.setCookie)?.[1];
  if (token === undefined) throw new Error("no token");
  return { token, userId: result.body.user.id };
}

async function sessionDoc(token: string) {
  return (await getDb()).collection("sessions").findOne({ tokenHash: sha256Hex(token) });
}

beforeEach(async () => {
  const db = await getDb();
  for (const name of ["users", "wallets", "auth_challenges", "sessions", "security_events"]) {
    await db.collection(name).deleteMany({});
  }
});

describe("resolveSession", () => {
  it("returns null for no token and for an unknown token", async () => {
    expect(await resolveSession(null, T0)).toBeNull();
    expect(await resolveSession(randomToken(32), T0)).toBeNull();
  });

  it("does not write within the first hour, then slides once and reports it", async () => {
    const { token } = await signIn();
    const early = await resolveSession(token, new Date(T0.getTime() + 10 * MIN));
    expect(early?.slid).toBe(false);
    expect((await sessionDoc(token))?.lastSeenAt).toEqual(T0);
    const at = new Date(T0.getTime() + 61 * MIN);
    const late = await resolveSession(token, at);
    expect(late?.slid).toBe(true);
    expect(late?.session.expiresAt).toEqual(new Date(at.getTime() + 7 * DAY));
    expect(await sessionDoc(token)).toMatchObject({
      lastSeenAt: at,
      expiresAt: late?.session.expiresAt,
    });
    const again = await resolveSession(token, new Date(at.getTime() + MIN));
    expect(again?.slid).toBe(false);
  });

  it("writes once when concurrent requests race the hourly slide", async () => {
    const { token } = await signIn();
    const at = new Date(T0.getTime() + 2 * HOUR);
    const results = await Promise.all([1, 2, 3, 4].map(() => resolveSession(token, at)));
    expect(results.every((r) => r !== null)).toBe(true);
    expect(results.filter((r) => r?.slid === true)).toHaveLength(1);
  });

  it("expires after the idle lifetime without activity", async () => {
    const stillValid = await signIn();
    const idle = await signIn();
    expect(
      await resolveSession(stillValid.token, new Date(T0.getTime() + 7 * DAY - 1)),
    ).not.toBeNull();
    expect(await resolveSession(idle.token, new Date(T0.getTime() + 7 * DAY))).toBeNull();
  });

  it("caps sliding at the absolute lifetime", async () => {
    const { token } = await signIn();
    let at = T0;
    for (let i = 0; i < 40; i += 1) {
      at = new Date(at.getTime() + 23 * HOUR);
      const resolution = await resolveSession(token, at);
      if (at.getTime() >= T0.getTime() + 30 * DAY) {
        expect(resolution).toBeNull();
        return;
      }
      expect(resolution?.session.expiresAt.getTime()).toBeLessThanOrEqual(T0.getTime() + 30 * DAY);
    }
    throw new Error("absolute expiry was never reached");
  });

  it("returns null for a revoked session and for a suspended user", async () => {
    const revoked = await signIn();
    await (
      await getDb()
    )
      .collection("sessions")
      .updateOne({ tokenHash: sha256Hex(revoked.token) }, { $set: { revokedAt: T0 } });
    expect(await resolveSession(revoked.token, T0)).toBeNull();
    const suspended = await signIn();
    await (
      await getDb()
    )
      .collection("users")
      .updateOne(
        { _id: parseObjectId(suspended.userId) ?? undefined },
        { $set: { status: "suspended" } },
      );
    expect(await resolveSession(suspended.token, T0)).toBeNull();
  });
});

describe("logout", () => {
  it("revokes the session once and records one session_revoked event", async () => {
    const { token } = await signIn();
    const resolution = await resolveSession(token, T0);
    if (resolution === null) throw new Error("session did not resolve");
    const auth: AuthContext = {
      at: T0,
      ip: "unknown",
      userAgent: null,
      session: resolution.session,
    };
    await logout(auth);
    await logout(auth);
    expect(await resolveSession(token, T0)).toBeNull();
    const events = await (
      await getDb()
    )
      .collection("security_events")
      .find({ type: "session_revoked" })
      .toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: "logout", severity: "info" });
  });
});
