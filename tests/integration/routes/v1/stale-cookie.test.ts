import { afterEach, describe, expect, inject, it, vi } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import { clearSessionCookie } from "@/modules/auth";
import { logger } from "@/modules/shared";
import { signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { useEnv } from "../../../helpers/env";
import { TEST_APP_ORIGIN, TestClient } from "../../../helpers/http";
import { startStandalone, useDatabaseUri } from "../../../helpers/mongo";

const HTTP_ORIGIN = "http://127.0.0.1:3210";
const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Authentication required" };

let restoreEnv: (() => void) | null = null;

afterEach(async () => {
  restoreEnv?.();
  restoreEnv = null;
  await useDatabaseUri(inject("mongoUri"));
});

function getMe(client: TestClient, headers?: Record<string, string>) {
  return client.call(meRoute.GET, { method: "GET", path: "/api/v1/me", headers });
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

describe("withSession clears a stale session cookie on 401 (spec §7.2)", () => {
  it("clears the cookie of a logged-out session", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const token = client.cookie;
    expect(
      (await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" })).status,
    ).toBe(204);
    client.setCookie(token);
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.json).toEqual(UNAUTHENTICATED);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
    expect(client.cookie).toBeNull();
  });

  it("clears a malformed cookie value without a database lookup", async () => {
    const client = new TestClient();
    client.setCookie("not-a-token");
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
  });

  it("clears the cookie of a revoked session on another route", async () => {
    const phone = new TestClient();
    await signIn(phone, createTestWallet());
    const token = phone.cookie;
    await phone.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    const other = new TestClient();
    other.setCookie(token);
    const result = await other.call(sessionsRoute.GET, { method: "GET", path: "/api/v1/sessions" });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
  });

  it("clears the configured name when only the other cookie name is sent", async () => {
    const result = await getMe(new TestClient(), { cookie: `gw_session=${"a".repeat(43)}` });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("clears gw_session (no Secure) for an http:// APP_ORIGIN", async () => {
    restoreEnv = useEnv({ APP_ORIGIN: HTTP_ORIGIN });
    const client = new TestClient({ appOrigin: HTTP_ORIGIN });
    client.setCookie("b".repeat(43));
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual(["gw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"]);
  });

  it("sends no Set-Cookie when the request had no session cookie", async () => {
    const result = await getMe(new TestClient(), { cookie: "theme=dark" });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([]);
    const bare = await getMe(new TestClient());
    expect(bare.status).toBe(401);
    expect(bare.setCookies).toEqual([]);
  });

  it("returns 503 and keeps the cookie when the database is down", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    await useDatabaseUri(await stoppedUri());
    const result = await getMe(client);
    expect(result.status).toBe(503);
    expect(result.setCookies).toEqual([]);
  });
});
