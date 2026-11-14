import { describe, expect, it } from "vitest";
import { issueChallenge, resolveSession, verifySignIn } from "@/modules/auth";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { createTestWallet } from "../../helpers/ed25519";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const HOUR = 3_600_000;

async function signInAt(at: Date): Promise<string> {
  const wallet = createTestWallet();
  const meta = { at, ip: "unknown", userAgent: null };
  const view = await issueChallenge({ address: wallet.address, network: "devnet" }, meta);
  const result = await verifySignIn(
    { challengeId: view.challengeId, signature: wallet.sign(view.message) },
    meta,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(result.setCookie)?.[1];
  if (token === undefined) throw new Error("no token");
  return token;
}

async function storedTimes(token: string): Promise<{ lastSeenAt: Date; expiresAt: Date }> {
  const doc = await (await getDb()).collection("sessions").findOne({ tokenHash: sha256Hex(token) });
  if (doc === null) throw new Error("no session doc");
  return { lastSeenAt: doc.lastSeenAt as Date, expiresAt: doc.expiresAt as Date };
}

describe("resolveSession(token, at, { slide }) (spec §7.4)", () => {
  it("never writes with slide: false, even when a slide is due", async () => {
    const token = await signInAt(T0);
    const before = await storedTimes(token);
    const later = new Date(T0.getTime() + 2 * HOUR);
    const resolution = await resolveSession(token, later, { slide: false });
    expect(resolution).not.toBeNull();
    expect(resolution?.slid).toBe(false);
    expect(resolution?.session.expiresAt).toEqual(before.expiresAt);
    expect(await storedTimes(token)).toEqual(before);
  });

  it("still slides by default at the same time (control)", async () => {
    const token = await signInAt(T0);
    const before = await storedTimes(token);
    const later = new Date(T0.getTime() + 2 * HOUR);
    const resolution = await resolveSession(token, later);
    expect(resolution?.slid).toBe(true);
    const after = await storedTimes(token);
    expect(after.lastSeenAt).toEqual(later);
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
  });

  it("returns null for an unknown token with slide: false", async () => {
    expect(await resolveSession("c".repeat(43), T0, { slide: false })).toBeNull();
  });
});
