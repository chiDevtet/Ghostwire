import { describe, expect, it } from "vitest";
import * as revokeRoute from "@/app/api/v1/sessions/[id]/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import * as meRoute from "@/app/api/v1/me/route";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { signIn } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date("2026-11-13T10:00:00.000Z");

const ME = { method: "GET", path: "/api/v1/me" } as const;
const LIST = { method: "GET", path: "/api/v1/sessions" } as const;

interface SessionsBody {
  sessions: {
    id: string;
    current: boolean;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    network: string;
    userAgent: string | null;
  }[];
}

function revoke(client: TestClient, id: string) {
  return client.call(revokeRoute.DELETE, {
    method: "DELETE",
    path: `/api/v1/sessions/${id}`,
    params: { id },
  });
}

describe("GET /sessions", () => {
  it("lists the caller's active sessions with exactly one marked current", async () => {
    useTestClock(T0);
    const wallet = createTestWallet();
    const first = new TestClient();
    await signIn(first, wallet);
    const second = new TestClient();
    await signIn(second, wallet);
    await signIn(new TestClient(), createTestWallet());
    const mainnet = new TestClient();
    await signIn(mainnet, createTestWallet(), "mainnet-beta");
    expect(
      ((await mainnet.call(sessionsRoute.GET, LIST)).json as SessionsBody).sessions[0]?.network,
    ).toBe("mainnet-beta");
    const result = await second.call(sessionsRoute.GET, LIST);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const { sessions } = result.json as SessionsBody;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      current: expect.any(Boolean),
      createdAt: "2026-11-13T10:00:00.000Z",
      lastSeenAt: "2026-11-13T10:00:00.000Z",
      expiresAt: "2026-11-20T10:00:00.000Z",
      network: "devnet",
      userAgent: null,
    });
  });
});

describe("GET /sessions omissions", () => {
  it("omits revoked and idle-expired sessions", async () => {
    const clock = useTestClock(T0);
    const wallet = createTestWallet();
    const old = new TestClient();
    await signIn(old, wallet);
    clock.advance(7 * DAY + 1);
    const revoked = new TestClient();
    await signIn(revoked, wallet);
    const live = new TestClient();
    await signIn(live, wallet);
    const before = (await live.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    expect(before.sessions).toHaveLength(2);
    const target = before.sessions.find((s) => !s.current);
    if (target === undefined) throw new Error("expected another session");
    expect((await revoke(live, target.id)).status).toBe(204);
    const after = (await live.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    expect(after.sessions).toHaveLength(1);
    expect(after.sessions[0]?.current).toBe(true);
  });
});

describe("DELETE /sessions/:id", () => {
  it("is idempotent: the second revoke keeps revokedAt and records no second event", async () => {
    useTestClock(T0);
    const wallet = createTestWallet();
    const phone = new TestClient();
    const { userId } = await signIn(phone, wallet);
    const laptop = new TestClient();
    await signIn(laptop, wallet);
    const { sessions } = (await laptop.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    const other = sessions.find((s) => !s.current);
    if (other === undefined) throw new Error("expected a second session");
    const db = await getDb();
    const stored = () =>
      db.collection("sessions").findOne({ tokenHash: sha256Hex(phone.cookie ?? "") });
    expect((await revoke(laptop, other.id)).status).toBe(204);
    const first = (await stored())?.revokedAt;
    expect(first).toBeInstanceOf(Date);
    useTestClock(new Date(T0.getTime() + HOUR));
    expect((await revoke(laptop, other.id)).status).toBe(204);
    expect((await stored())?.revokedAt).toEqual(first);
    const events = await db
      .collection("security_events")
      .find({ type: "session_revoked", reason: "user_revoked" })
      .toArray();
    expect(events.filter((e) => String(e.userId) === userId)).toHaveLength(1);
  });

  it("rejects a foreign Origin with 403 and leaves the session active", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const { sessions } = (await client.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    const id = sessions[0]?.id ?? "";
    const result = await client.call(revokeRoute.DELETE, {
      method: "DELETE",
      path: `/api/v1/sessions/${id}`,
      params: { id },
      origin: "https://evil.example",
    });
    expect(result.status).toBe(403);
    expect((await client.call(meRoute.GET, ME)).status).toBe(200);
  });

  it("revokes another own session (204, no cookie change) and that cookie then gets 401", async () => {
    const wallet = createTestWallet();
    const phone = new TestClient();
    await signIn(phone, wallet);
    const laptop = new TestClient();
    await signIn(laptop, wallet);
    const { sessions } = (await laptop.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    const other = sessions.find((s) => !s.current);
    if (other === undefined) throw new Error("expected a second session");
    const result = await revoke(laptop, other.id);
    expect(result.status).toBe(204);
    expect(result.setCookies).toEqual([]);
    expect((await phone.call(meRoute.GET, ME)).status).toBe(401);
    expect((await laptop.call(meRoute.GET, ME)).status).toBe(200);
    expect((await revoke(laptop, other.id)).status).toBe(204);
  });

  it("revoking the current session clears the cookie", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const { sessions } = (await client.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    const current = sessions.find((s) => s.current);
    if (current === undefined) throw new Error("expected a current session");
    const result = await revoke(client, current.id);
    expect(result.status).toBe(204);
    expect(result.setCookies).toEqual([
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
    expect(client.cookie).toBeNull();
  });

  it("returns 404 for another user's session, a nonexistent id and a malformed id", async () => {
    const alice = new TestClient();
    await signIn(alice, createTestWallet());
    const bob = new TestClient();
    await signIn(bob, createTestWallet());
    const { sessions } = (await bob.call(sessionsRoute.GET, LIST)).json as SessionsBody;
    const bobSession = sessions[0]?.id ?? "";
    for (const id of [bobSession, "0123456789abcdef01234567", "not-an-id"]) {
      const result = await revoke(alice, id);
      expect(result.status).toBe(404);
      expect(result.json).toEqual({ code: "NOT_FOUND", message: "Not found" });
    }
    expect((await bob.call(meRoute.GET, ME)).status).toBe(200);
  });
});

describe("session lifetimes through the routes", () => {
  it("idle expiry: 401 after SESSION_IDLE_DAYS without activity", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    clock.advance(7 * DAY + 1);
    expect((await client.call(meRoute.GET, ME)).status).toBe(401);
  });

  it("absolute expiry: 401 at SESSION_MAX_DAYS even when active every 23 h", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    let lastOk = T0;
    for (let i = 0; i < 40; i += 1) {
      clock.advance(23 * HOUR);
      const result = await client.call(meRoute.GET, ME);
      if (result.status === 401) {
        expect(clock.now().getTime()).toBeGreaterThanOrEqual(T0.getTime() + 30 * DAY);
        expect(lastOk.getTime()).toBeLessThan(T0.getTime() + 30 * DAY);
        return;
      }
      expect(result.status).toBe(200);
      lastOk = clock.now();
    }
    throw new Error("absolute expiry was never reached");
  });

  it("slides at most once per hour and re-sends the cookie when it does", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const token = client.cookie ?? "";
    const db = await getDb();
    clock.advance(10 * MIN);
    const early = await client.call(meRoute.GET, ME);
    expect(early.setCookies).toEqual([]);
    expect(
      (await db.collection("sessions").findOne({ tokenHash: sha256Hex(token) }))?.lastSeenAt,
    ).toEqual(T0);
    clock.advance(51 * MIN);
    const late = await client.call(meRoute.GET, ME);
    expect(late.setCookies).toEqual([
      `__Host-gw_session=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
    ]);
    const stored = await db.collection("sessions").findOne({ tokenHash: sha256Hex(token) });
    expect(stored?.lastSeenAt).toEqual(clock.now());
  });

  it("caps the re-sent Max-Age at the absolute expiry", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    for (let day = 1; day <= 29; day += 1) {
      clock.set(new Date(T0.getTime() + day * DAY));
      expect((await client.call(meRoute.GET, ME)).status).toBe(200);
    }
    clock.set(new Date(T0.getTime() + 29 * DAY + 12 * HOUR));
    const result = await client.call(meRoute.GET, ME);
    expect(result.setCookies[0]).toContain("Max-Age=43200;");
  });
});
