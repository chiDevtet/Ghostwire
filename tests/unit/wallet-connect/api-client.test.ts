import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_NETWORK_IDS } from "@/modules/validation";
import {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
  type ApiResult,
} from "@/modules/wallet-connect";
import { json, mockApi, noContent, type FakeApi } from "../../helpers/fake-api";

const ID = "a".repeat(24);
const ID2 = "b".repeat(24);
const ISO = "2026-11-13T10:00:00.000Z";
const WALLET = {
  id: ID,
  address: "Addr1",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: ISO,
} as const;
const SESSION = {
  id: ID2,
  current: true,
  createdAt: ISO,
  lastSeenAt: ISO,
  expiresAt: ISO,
  network: "devnet",
  userAgent: null,
} as const;
const CHALLENGE = { challengeId: ID, message: "m", expiresAt: ISO };

let api: FakeApi | null = null;
let unregister: (() => void) | null = null;

afterEach(() => {
  api?.restore();
  api = null;
  unregister?.();
  unregister = null;
});

function only(): Request {
  expect(api?.requests).toHaveLength(1);
  return api?.requests[0] as Request;
}

describe("requests", () => {
  it.each<{
    name: string;
    call: () => Promise<ApiResult<unknown>>;
    method: string;
    path: string;
    body: unknown;
  }>([
    {
      name: "challenge",
      call: () => challenge({ address: "Addr1", network: "devnet" }),
      method: "POST",
      path: "/api/v1/auth/challenge",
      body: { address: "Addr1", network: "devnet" },
    },
    {
      name: "verify",
      call: () => verify({ challengeId: ID, signature: "sig", provider: "phantom" }),
      method: "POST",
      path: "/api/v1/auth/verify",
      body: { challengeId: ID, signature: "sig", provider: "phantom" },
    },
    {
      name: "verify without provider",
      call: () => verify({ challengeId: ID, signature: "sig" }),
      method: "POST",
      path: "/api/v1/auth/verify",
      body: { challengeId: ID, signature: "sig" },
    },
    {
      name: "logout",
      call: () => logout(),
      method: "POST",
      path: "/api/v1/auth/logout",
      body: null,
    },
    { name: "me", call: () => me(), method: "GET", path: "/api/v1/me", body: null },
    {
      name: "listWallets",
      call: () => listWallets(),
      method: "GET",
      path: "/api/v1/wallets",
      body: null,
    },
    {
      name: "linkChallenge",
      call: () => linkChallenge({ address: "Addr2", network: "mainnet-beta" }),
      method: "POST",
      path: "/api/v1/wallets/link/challenge",
      body: { address: "Addr2", network: "mainnet-beta" },
    },
    {
      name: "linkVerify",
      call: () => linkVerify({ challengeId: ID, signature: "sig" }),
      method: "POST",
      path: "/api/v1/wallets/link/verify",
      body: { challengeId: ID, signature: "sig" },
    },
    {
      name: "unlinkWallet",
      call: () => unlinkWallet(ID),
      method: "DELETE",
      path: `/api/v1/wallets/${ID}`,
      body: null,
    },
    {
      name: "listSessions",
      call: () => listSessions(),
      method: "GET",
      path: "/api/v1/sessions",
      body: null,
    },
    {
      name: "revokeSession",
      call: () => revokeSession(ID2),
      method: "DELETE",
      path: `/api/v1/sessions/${ID2}`,
      body: null,
    },
  ])("$name sends $method $path same-origin and no-store", async ({ call, method, path, body }) => {
    api = mockApi({});
    await call();
    const request = only();
    expect(request.method).toBe(method);
    expect(new URL(request.url).pathname).toBe(path);
    expect(new URL(request.url).search).toBe("");
    expect(request.credentials).toBe("same-origin");
    expect(request.cache).toBe("no-store");
    const text = await request.text();
    if (body === null) {
      expect(text).toBe("");
    } else {
      expect(JSON.parse(text)).toEqual(body);
      expect(request.headers.get("content-type")).toBe("application/json");
    }
  });

  it("exposes the same ten functions on apiClient", () => {
    expect(Object.keys(apiClient).sort()).toEqual(
      [
        "challenge",
        "linkChallenge",
        "linkVerify",
        "listSessions",
        "listWallets",
        "logout",
        "me",
        "revokeSession",
        "unlinkWallet",
        "verify",
      ].sort(),
    );
    expect(apiClient.me).toBe(me);
  });
});

describe("success mapping", () => {
  it("parses challenge, sign-in, me, wallets and sessions and strips unknown keys", async () => {
    api = mockApi({
      "POST /api/v1/auth/challenge": () => json(200, { ...CHALLENGE, extra: 1 }),
      "POST /api/v1/auth/verify": () =>
        json(200, { user: { id: ID }, wallet: { id: ID, address: "Addr1", network: "devnet" } }),
      "GET /api/v1/me": () =>
        json(200, {
          user: { id: ID, createdAt: ISO },
          session: { id: ID2, network: "devnet", expiresAt: ISO },
          wallets: [WALLET],
        }),
      "GET /api/v1/wallets": () => json(200, { wallets: [{ ...WALLET, extra: true }] }),
      "GET /api/v1/sessions": () => json(200, { sessions: [SESSION] }),
    });
    expect(await challenge({ address: "Addr1", network: "devnet" })).toEqual({
      ok: true,
      data: CHALLENGE,
    });
    expect((await verify({ challengeId: ID, signature: "s" })).ok).toBe(true);
    const meResult = await me();
    expect(meResult.ok && meResult.data.wallets).toEqual([WALLET]);
    expect(await listWallets()).toEqual({ ok: true, data: [WALLET] });
    expect(await listSessions()).toEqual({ ok: true, data: [SESSION] });
  });

  it("maps linkVerify 201 to created: true and 200 to created: false", async () => {
    let status = 201;
    api = mockApi({ "POST /api/v1/wallets/link/verify": () => json(status, { wallet: WALLET }) });
    expect(await linkVerify({ challengeId: ID, signature: "s" })).toEqual({
      ok: true,
      data: { wallet: WALLET, created: true },
    });
    status = 200;
    expect(await linkVerify({ challengeId: ID, signature: "s" })).toEqual({
      ok: true,
      data: { wallet: WALLET, created: false },
    });
  });

  it("returns data null for a 204", async () => {
    api = mockApi({
      "POST /api/v1/auth/logout": () => noContent(),
      "DELETE /api/v1/wallets/:id": () => noContent(),
      "DELETE /api/v1/sessions/:id": () => noContent(),
    });
    expect(await logout()).toEqual({ ok: true, data: null });
    expect(await unlinkWallet(ID)).toEqual({ ok: true, data: null });
    expect(await revokeSession(ID)).toEqual({ ok: true, data: null });
  });

  it.each(SOLANA_NETWORK_IDS)("accepts every server network id (%s)", async (network) => {
    api = mockApi({
      "GET /api/v1/wallets": () => json(200, { wallets: [{ ...WALLET, network }] }),
    });
    expect((await listWallets()).ok).toBe(true);
  });
});

describe("failure mapping", () => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["AUTH_FAILED", 401],
    ["VALIDATION_FAILED", 400],
    ["NETWORK_UNSUPPORTED", 400],
    ["NOT_FOUND", 404],
    ["LAST_WALLET", 409],
    ["WALLET_ALREADY_LINKED", 409],
    ["ORIGIN_REJECTED", 403],
    ["RATE_LIMITED", 429],
    ["DEPENDENCY_UNAVAILABLE", 503],
    ["INTERNAL", 500],
  ])("maps %s (%i) to { ok: false, code, message }", async (code, status) => {
    api = mockApi({ "GET /api/v1/me": () => json(status, { code, message: "safe message" }) });
    const result = await me();
    expect(result).toMatchObject({ ok: false, code, message: "safe message" });
    if (status !== 429) expect(result).not.toHaveProperty("retryAfter");
  });

  it.each([
    ["42", 42],
    [null, 60],
    ["abc", 60],
    ["0", 1],
    ["99999", 3600],
  ])("reads Retry-After %s on a 429 as %i seconds", async (header, seconds) => {
    const headers: Record<string, string> = header === null ? {} : { "Retry-After": header };
    api = mockApi({
      "POST /api/v1/auth/challenge": () =>
        json(429, { code: "RATE_LIMITED", message: "Too many requests" }, headers),
    });
    expect(await challenge({ address: "Addr1", network: "devnet" })).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryAfter: seconds,
    });
  });

  it("maps a fetch rejection to NETWORK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    api = { requests: [], restore: () => vi.unstubAllGlobals() };
    expect(await me()).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("maps an aborted request to ABORTED", async () => {
    api = mockApi({ "GET /api/v1/me": () => new Promise<Response>(() => undefined) });
    const controller = new AbortController();
    const pending = me({ signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: "ABORTED" });
  });

  it.each<[string, () => Response]>([
    ["a non-JSON 200 body", () => new Response("<html>", { status: 200 })],
    ["a schema mismatch", () => json(200, { user: { id: "not-an-id" } })],
    ["a non-JSON error body", () => new Response("oops", { status: 500 })],
    ["an error body without code", () => json(400, { message: "x" })],
  ])("maps %s to UNEXPECTED_RESPONSE", async (_label, respond) => {
    api = mockApi({ "GET /api/v1/me": respond });
    expect(await me()).toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it("maps a 200 on a 204 endpoint to UNEXPECTED_RESPONSE", async () => {
    api = mockApi({ "POST /api/v1/auth/logout": () => json(200, {}) });
    expect(await logout()).toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it("never throws when response.json() throws", async () => {
    api = mockApi({
      "GET /api/v1/me": () => {
        const response = new Response("{}", { status: 200 });
        Object.defineProperty(response, "json", { value: () => Promise.reject(new Error("x")) });
        return response;
      },
    });
    await expect(me()).resolves.toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it.each([
    ["unlinkWallet", (id: string) => unlinkWallet(id)],
    ["revokeSession", (id: string) => revokeSession(id)],
  ])("%s rejects a non-ObjectId id without calling fetch", async (_name, call) => {
    api = mockApi({});
    for (const id of ["../me", "ABC", "a".repeat(23), `${"a".repeat(24)}/x`]) {
      expect(await call(id)).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe("onUnauthenticated", () => {
  it("calls the handler once for UNAUTHENTICATED but not for AUTH_FAILED", async () => {
    const handler = vi.fn();
    unregister = onUnauthenticated(handler);
    let code = "UNAUTHENTICATED";
    api = mockApi({ "GET /api/v1/me": () => json(401, { code, message: "m" }) });
    await me();
    expect(handler).toHaveBeenCalledTimes(1);
    code = "AUTH_FAILED";
    await me();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unregister clears the slot only if it still holds the same handler", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = onUnauthenticated(first);
    unregister = onUnauthenticated(second);
    unregisterFirst();
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    await me();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unregister();
    unregister = null;
    await me();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("swallows a throwing handler", async () => {
    unregister = onUnauthenticated(() => {
      throw new Error("handler broke");
    });
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    await expect(me()).resolves.toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});
