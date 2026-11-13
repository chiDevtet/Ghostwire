import { describe, expect, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as verifyRoute from "@/app/api/v1/auth/verify/route";
import * as meRoute from "@/app/api/v1/me/route";
import { requestChallenge, verify } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";

const ME = { method: "GET", path: "/api/v1/me" } as const;

describe("sign-in happy path", () => {
  it("challenge -> verify -> cookie -> /me -> logout -> /me 401", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();

    const challenge = await requestChallenge(client, wallet, "devnet");
    expect(challenge.message.split("\n")[0]).toBe(
      "ghostwire.test wants you to sign in with your Solana account:",
    );

    const verified = await verify(client, challenge, wallet.sign(challenge.message), {
      provider: "phantom",
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("cache-control")).toBe("no-store");
    const body = verified.json as {
      user: { id: string };
      wallet: { id: string; address: string; network: string };
    };
    expect(body.wallet).toEqual({ id: body.wallet.id, address: wallet.address, network: "devnet" });
    expect(verified.setCookies).toHaveLength(1);
    expect(verified.setCookies[0]).toMatch(
      /^__Host-gw_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(client.cookie).not.toBeNull();

    const me = await client.call(meRoute.GET, ME);
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(me.json).toEqual({
      user: { id: body.user.id, createdAt: expect.any(String) },
      session: {
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        network: "devnet",
        expiresAt: expect.any(String),
      },
      wallets: [
        {
          id: body.wallet.id,
          address: wallet.address,
          network: "devnet",
          provider: "phantom",
          status: "active",
          linkedAt: expect.any(String),
        },
      ],
    });

    const out = await client.call(logoutRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/logout",
    });
    expect(out.status).toBe(204);
    expect(out.json).toBeNull();
    expect(out.setCookies).toEqual([
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
    expect(client.cookie).toBeNull();

    const after = await client.call(meRoute.GET, ME);
    expect(after.status).toBe(401);
    expect(after.json).toEqual({ code: "UNAUTHENTICATED", message: "Authentication required" });
  });

  it("rejects the old token after logout even if the client still sends it", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet);
    await verify(client, challenge, wallet.sign(challenge.message));
    const token = client.cookie;
    await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    client.setCookie(token);
    expect((await client.call(meRoute.GET, ME)).status).toBe(401);
  });

  it("exports nodejs runtime and force-dynamic from every auth route", () => {
    for (const route of [challengeRoute, verifyRoute, logoutRoute, meRoute]) {
      expect(route.runtime).toBe("nodejs");
      expect(route.dynamic).toBe("force-dynamic");
    }
  });
});
