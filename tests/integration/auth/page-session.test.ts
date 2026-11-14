import { afterEach, describe, expect, inject, it } from "vitest";
import { issueChallenge, resolvePageSession, verifySignIn } from "@/modules/auth";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { DependencyUnavailableError } from "@/modules/shared";
import { useTestClock } from "../../helpers/clock";
import { createTestWallet } from "../../helpers/ed25519";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const HOUR = 3_600_000;
/** The integration setup uses https://ghostwire.test, so the configured name is the __Host- one. */
const NAME = "__Host-gw_session";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

async function signInAt(at: Date): Promise<{ token: string; userId: string; walletId: string }> {
  const wallet = createTestWallet();
  const meta = { at, ip: "unknown", userAgent: null };
  const view = await issueChallenge({ address: wallet.address, network: "devnet" }, meta);
  const result = await verifySignIn(
    { challengeId: view.challengeId, signature: wallet.sign(view.message) },
    meta,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(result.setCookie)?.[1];
  if (token === undefined) throw new Error("no token");
  return { token, userId: result.body.user.id, walletId: result.body.wallet.id };
}

function jar(entries: Readonly<Record<string, string>>) {
  return { get: (name: string) => (name in entries ? { value: entries[name] ?? "" } : undefined) };
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

describe("resolvePageSession", () => {
  it("resolves the configured cookie to a PageSession at now()", async () => {
    const { token, userId, walletId } = await signInAt(T0);
    const clock = useTestClock(new Date(T0.getTime() + 10 * 60_000));
    const page = await resolvePageSession(jar({ [NAME]: token }));
    expect(page?.at).toEqual(clock.now());
    expect(page?.session.userId.toHexString()).toBe(userId);
    expect(page?.session.walletId.toHexString()).toBe(walletId);
    expect(page?.session.network).toBe("devnet");
  });

  it("never writes, even two hours later", async () => {
    const { token } = await signInAt(T0);
    const sessions = (await getDb()).collection("sessions");
    const before = await sessions.findOne({ tokenHash: sha256Hex(token) });
    useTestClock(new Date(T0.getTime() + 2 * HOUR));
    expect(await resolvePageSession(jar({ [NAME]: token }))).not.toBeNull();
    const after = await sessions.findOne({ tokenHash: sha256Hex(token) });
    expect(after?.lastSeenAt).toEqual(before?.lastSeenAt);
    expect(after?.expiresAt).toEqual(before?.expiresAt);
  });

  it("returns null for the other cookie name", async () => {
    const { token } = await signInAt(T0);
    useTestClock(T0);
    expect(await resolvePageSession(jar({ gw_session: token }))).toBeNull();
  });

  it("returns null for a malformed value without querying (works with the database down)", async () => {
    await useDatabaseUri(await stoppedUri());
    expect(await resolvePageSession(jar({ [NAME]: "malformed" }))).toBeNull();
    expect(await resolvePageSession(jar({}))).toBeNull();
  });

  it("throws DependencyUnavailableError for a well-formed token when the database is down", async () => {
    await useDatabaseUri(await stoppedUri());
    await expect(resolvePageSession(jar({ [NAME]: "d".repeat(43) }))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
});
