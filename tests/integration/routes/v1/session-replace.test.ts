import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import { getDb } from "@/modules/database";
import { linkWallet, signIn } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { captureLogLines, type CapturedLogs } from "../../../helpers/logs";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const DAY = 86_400_000;

let capture: CapturedLogs | null = null;

beforeEach(async () => {
  const db = await getDb();
  for (const name of ["users", "wallets", "auth_challenges", "sessions", "security_events"]) {
    await db.collection(name).deleteMany({});
  }
});

afterEach(async () => {
  capture?.restore();
  capture = null;
  await (await getDb()).command({ collMod: "sessions", validator: {}, validationLevel: "off" });
});

/** /me with an explicit token (null jar = no cookie). */
async function meStatus(token: string | null): Promise<number> {
  const client = new TestClient();
  client.setCookie(token);
  return (await client.call(meRoute.GET, { method: "GET", path: "/api/v1/me" })).status;
}

async function replacedEvents(): Promise<{ userId: string }[]> {
  const docs = await (
    await getDb()
  )
    .collection("security_events")
    .find({ type: "session_revoked", reason: "replaced" })
    .toArray();
  return docs.map((doc) => ({ userId: String(doc.userId) }));
}

describe("re-sign-in replaces the request's previous session (spec §7.3)", () => {
  it("revokes the same user's previous session and keeps exactly one active", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const first = await signIn(client, wallet);
    const oldToken = client.cookie;
    await signIn(client, wallet);
    const newToken = client.cookie;
    expect(newToken).not.toBe(oldToken);
    expect(await meStatus(oldToken)).toBe(401);
    expect(await meStatus(newToken)).toBe(200);
    const sessions = await client.call(sessionsRoute.GET, {
      method: "GET",
      path: "/api/v1/sessions",
    });
    expect((sessions.json as { sessions: unknown[] }).sessions).toHaveLength(1);
    const events = await replacedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(first.userId);
  });

  it("revokes a different user's session held by the same client (network switch)", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const devnet = await signIn(client, wallet, "devnet");
    const oldToken = client.cookie;
    const mainnet = await signIn(client, wallet, "mainnet-beta");
    expect(mainnet.userId).not.toBe(devnet.userId);
    expect(await meStatus(oldToken)).toBe(401);
    expect(await meStatus(client.cookie)).toBe(200);
    const events = await replacedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(devnet.userId);
  });

  it("records nothing when the previous token is already revoked", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const oldToken = client.cookie;
    await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    client.setCookie(oldToken);
    await signIn(client, createTestWallet());
    expect(await meStatus(client.cookie)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("records nothing when the previous session has expired", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    clock.advance(8 * DAY);
    await signIn(client, createTestWallet());
    expect(await meStatus(client.cookie)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("does not revoke anything on link verify", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const token = client.cookie;
    expect((await linkWallet(client, createTestWallet())).status).toBe(201);
    expect(client.cookie).toBe(token);
    expect(await meStatus(token)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("is best effort: a failed revoke still returns 200 with a new cookie and logs warn with a code only", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const oldToken = client.cookie;
    // From now on any update that sets revokedAt to a date is rejected by the server.
    await (
      await getDb()
    ).command({
      collMod: "sessions",
      validator: { $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }] },
      validationLevel: "strict",
      validationAction: "error",
    });
    capture = captureLogLines();
    await signIn(client, createTestWallet());
    const newToken = client.cookie;
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);
    expect(await meStatus(newToken)).toBe(200);
    expect(await meStatus(oldToken)).toBe(200);
    const warn = capture
      .lines()
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.msg === "previous session revoke failed");
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ level: "warn" });
    expect(typeof warn[0]?.code).toBe("string");
    expect(warn[0]).not.toHaveProperty("err");
    expect(await replacedEvents()).toEqual([]);
  });
});
