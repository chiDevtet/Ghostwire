import { describe, expect, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as verifyRoute from "@/app/api/v1/auth/verify/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as revokeRoute from "@/app/api/v1/sessions/[id]/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import * as unlinkRoute from "@/app/api/v1/wallets/[id]/route";
import * as linkChallengeRoute from "@/app/api/v1/wallets/link/challenge/route";
import * as linkVerifyRoute from "@/app/api/v1/wallets/link/verify/route";
import * as walletsRoute from "@/app/api/v1/wallets/route";
import type { RouteHandler } from "@/modules/auth";
import { signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient, type CallOptions } from "../../../helpers/http";

const ORIGIN_REJECTED = { code: "ORIGIN_REJECTED", message: "Origin not allowed" };
const ID = "0123456789abcdef01234567";

interface NonGetRoute {
  readonly name: string;
  readonly handler: RouteHandler<{ id: string }> | RouteHandler;
  readonly options: CallOptions;
}

const NON_GET: readonly NonGetRoute[] = [
  {
    name: "POST /auth/challenge",
    handler: challengeRoute.POST,
    options: {
      method: "POST",
      path: "/api/v1/auth/challenge",
      body: { address: "x", network: "devnet" },
    },
  },
  {
    name: "POST /auth/verify",
    handler: verifyRoute.POST,
    options: { method: "POST", path: "/api/v1/auth/verify", body: {} },
  },
  {
    name: "POST /auth/logout",
    handler: logoutRoute.POST,
    options: { method: "POST", path: "/api/v1/auth/logout" },
  },
  {
    name: "DELETE /sessions/:id",
    handler: revokeRoute.DELETE,
    options: { method: "DELETE", path: `/api/v1/sessions/${ID}`, params: { id: ID } },
  },
  {
    name: "POST /wallets/link/challenge",
    handler: linkChallengeRoute.POST,
    options: { method: "POST", path: "/api/v1/wallets/link/challenge", body: {} },
  },
  {
    name: "POST /wallets/link/verify",
    handler: linkVerifyRoute.POST,
    options: { method: "POST", path: "/api/v1/wallets/link/verify", body: {} },
  },
  {
    name: "DELETE /wallets/:id",
    handler: unlinkRoute.DELETE,
    options: { method: "DELETE", path: `/api/v1/wallets/${ID}`, params: { id: ID } },
  },
];

async function signedInClient(): Promise<TestClient> {
  const client = new TestClient();
  await signIn(client, createTestWallet());
  return client;
}

function call(client: TestClient, route: NonGetRoute, origin: string | null | undefined) {
  return client.call(route.handler as RouteHandler<object>, { ...route.options, origin });
}

describe("Origin check on every non-GET route", () => {
  it.each(NON_GET)("$name: no Origin -> 403 ORIGIN_REJECTED", async (route) => {
    const result = await call(await signedInClient(), route, null);
    expect(result.status).toBe(403);
    expect(result.json).toEqual(ORIGIN_REJECTED);
  });

  it.each(NON_GET)("$name: foreign Origin -> 403 ORIGIN_REJECTED", async (route) => {
    const result = await call(await signedInClient(), route, "https://evil.test");
    expect(result.status).toBe(403);
    expect(result.json).toEqual(ORIGIN_REJECTED);
  });

  it.each(NON_GET)("$name: matching Origin -> not 403", async (route) => {
    const result = await call(await signedInClient(), route, undefined);
    expect(result.status).not.toBe(403);
  });

  it("rejects a foreign Origin before the session is checked (no cookie -> still 403)", async () => {
    const result = await new TestClient().call(logoutRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/logout",
      origin: "https://evil.test",
    });
    expect(result.status).toBe(403);
  });

  it.each([
    { name: "GET /me", handler: meRoute.GET, path: "/api/v1/me" },
    { name: "GET /sessions", handler: sessionsRoute.GET, path: "/api/v1/sessions" },
    { name: "GET /wallets", handler: walletsRoute.GET, path: "/api/v1/wallets" },
  ])("$name needs no Origin", async ({ handler, path }) => {
    const client = await signedInClient();
    const result = await client.call(handler, { method: "GET", path, origin: null });
    expect(result.status).toBe(200);
  });
});
