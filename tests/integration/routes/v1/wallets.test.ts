import { describe, expect, it } from "vitest";
import * as meRoute from "@/app/api/v1/me/route";
import * as unlinkRoute from "@/app/api/v1/wallets/[id]/route";
import * as linkChallengeRoute from "@/app/api/v1/wallets/link/challenge/route";
import * as walletsRoute from "@/app/api/v1/wallets/route";
import { getDb, parseObjectId } from "@/modules/database";
import {
  linkWallet,
  requestChallenge,
  requestLinkChallenge,
  signIn,
  verifyLinkCall,
} from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";

const ME = { method: "GET", path: "/api/v1/me" } as const;
const LIST = { method: "GET", path: "/api/v1/wallets" } as const;

interface WalletBody {
  id: string;
  address: string;
  network: string;
  provider: string | null;
  status: "active" | "disconnected";
  linkedAt: string;
}

function unlink(client: TestClient, id: string) {
  return client.call(unlinkRoute.DELETE, {
    method: "DELETE",
    path: `/api/v1/wallets/${id}`,
    params: { id },
  });
}

async function walletsOf(client: TestClient): Promise<WalletBody[]> {
  const result = await client.call(walletsRoute.GET, LIST);
  expect(result.status).toBe(200);
  return (result.json as { wallets: WalletBody[] }).wallets;
}

describe("linking wallets", () => {
  it("links a second wallet (201) that then signs in to the same user", async () => {
    const client = new TestClient();
    const first = createTestWallet();
    const second = createTestWallet();
    const { userId } = await signIn(client, first);
    const challenge = await requestLinkChallenge(client, second, "mainnet-beta");
    expect(challenge.message.split("\n")[3]).toBe(
      "Link this wallet to your GHOST WIRE account. This does not authorize any transaction or move funds.",
    );
    const linked = await verifyLinkCall(client, challenge, second.sign(challenge.message), {
      provider: "solflare",
    });
    expect(linked.status).toBe(201);
    expect((linked.json as { wallet: WalletBody }).wallet).toMatchObject({
      address: second.address,
      network: "mainnet-beta",
      provider: "solflare",
      status: "active",
    });
    expect((await walletsOf(client)).map((w) => w.address)).toEqual([
      first.address,
      second.address,
    ]);
    const again = await signIn(new TestClient(), second, "mainnet-beta");
    expect(again.userId).toBe(userId);
  });

  it("returns 200 with the existing wallet when re-linking an already active own wallet", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const { walletId } = await signIn(client, wallet);
    const result = await linkWallet(client, wallet);
    expect(result.status).toBe(200);
    expect((result.json as { wallet: WalletBody }).wallet.id).toBe(walletId);
  });

  it("returns 409 WALLET_ALREADY_LINKED for a wallet owned by another user", async () => {
    const owned = createTestWallet();
    await signIn(new TestClient(), owned);
    const other = new TestClient();
    await signIn(other, createTestWallet());
    const result = await linkWallet(other, owned);
    expect(result.status).toBe(409);
    expect(result.json).toEqual({
      code: "WALLET_ALREADY_LINKED",
      message: "Wallet is linked to another account",
    });
    const event = await (
      await getDb()
    )
      .collection("security_events")
      .findOne({ type: "link_failed", reason: "wallet_other_account" });
    expect(event).not.toBeNull();
  });

  it("rejects user A's link challenge verified by user B with 401 AUTH_FAILED", async () => {
    const alice = new TestClient();
    await signIn(alice, createTestWallet());
    const bob = new TestClient();
    await signIn(bob, createTestWallet());
    const target = createTestWallet();
    const challenge = await requestLinkChallenge(alice, target);
    const result = await verifyLinkCall(bob, challenge, target.sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual({ code: "AUTH_FAILED", message: "Authentication failed" });
  });

  it("rejects a sign-in challenge used at /wallets/link/verify (wrong purpose)", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const target = createTestWallet();
    const challenge = await requestChallenge(new TestClient(), target);
    const result = await verifyLinkCall(client, challenge, target.sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual({ code: "AUTH_FAILED", message: "Authentication failed" });
  });

  it("requires a session for the wallet routes", async () => {
    const anonymous = new TestClient();
    expect((await anonymous.call(walletsRoute.GET, LIST)).status).toBe(401);
    const challenge = await anonymous.call(linkChallengeRoute.POST, {
      method: "POST",
      path: "/api/v1/wallets/link/challenge",
      body: { address: createTestWallet().address, network: "devnet" },
    });
    expect(challenge.status).toBe(401);
  });
});

describe("unlinking wallets", () => {
  it("refuses to unlink the last active wallet with 409 LAST_WALLET", async () => {
    const client = new TestClient();
    const { walletId } = await signIn(client, createTestWallet());
    const result = await unlink(client, walletId);
    expect(result.status).toBe(409);
    expect(result.json).toEqual({
      code: "LAST_WALLET",
      message: "Cannot unlink the only active wallet",
    });
    expect((await walletsOf(client))[0]?.status).toBe("active");
  });

  it("unlinks a second wallet, revokes its sessions, keeps it listed as disconnected", async () => {
    const main = new TestClient();
    await signIn(main, createTestWallet());
    const extra = createTestWallet();
    const linked = await linkWallet(main, extra);
    const extraId = (linked.json as { wallet: WalletBody }).wallet.id;
    const extraSession = new TestClient();
    await signIn(extraSession, extra);
    const result = await unlink(main, extraId);
    expect(result.status).toBe(204);
    expect(result.setCookies).toEqual([]);
    expect((await extraSession.call(meRoute.GET, ME)).status).toBe(401);
    expect((await main.call(meRoute.GET, ME)).status).toBe(200);
    const listed = await walletsOf(main);
    expect(listed.find((w) => w.id === extraId)?.status).toBe("disconnected");
    expect((await unlink(main, extraId)).status).toBe(204);
  });

  it("clears the cookie when unlinking the wallet of the current session", async () => {
    const wallet = createTestWallet();
    const client = new TestClient();
    const { walletId } = await signIn(client, wallet);
    await linkWallet(client, createTestWallet());
    const result = await unlink(client, walletId);
    expect(result.status).toBe(204);
    expect(result.setCookies).toEqual([
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
    expect(client.cookie).toBeNull();
  });

  it("reactivates a disconnected wallet on sign-in and on re-link", async () => {
    const main = new TestClient();
    const { userId } = await signIn(main, createTestWallet());
    const extra = createTestWallet();
    const extraId = ((await linkWallet(main, extra)).json as { wallet: WalletBody }).wallet.id;
    await unlink(main, extraId);
    const relinked = await linkWallet(main, extra);
    expect(relinked.status).toBe(200);
    expect((relinked.json as { wallet: WalletBody }).wallet.status).toBe("active");
    await unlink(main, extraId);
    const back = await signIn(new TestClient(), extra);
    expect(back.userId).toBe(userId);
    expect((await walletsOf(main)).find((w) => w.id === extraId)?.status).toBe("active");
  });

  it("leaves exactly one active wallet when the last two are unlinked concurrently", async () => {
    const client = new TestClient();
    const { userId, walletId: first } = await signIn(client, createTestWallet());
    const second = ((await linkWallet(client, createTestWallet())).json as { wallet: WalletBody })
      .wallet.id;
    const other = new TestClient();
    other.setCookie(client.cookie);
    const results = await Promise.all([unlink(client, first), unlink(other, second)]);
    const statuses = results.map((r) => r.status).sort();
    // One unlink wins. The other loses with 409 LAST_WALLET, or with 401 when the winner was
    // the wallet of the shared session and revoked it before the loser resolved the cookie.
    expect(statuses[0]).toBe(204);
    expect([401, 409]).toContain(statuses[1]);
    const active = await (
      await getDb()
    )
      .collection("wallets")
      .countDocuments({ userId: parseObjectId(userId) ?? undefined, status: "active" });
    expect(active).toBe(1);
  });

  it("returns 404 for another user's wallet, a nonexistent id and a malformed id", async () => {
    const alice = new TestClient();
    await signIn(alice, createTestWallet());
    await linkWallet(alice, createTestWallet());
    const bob = new TestClient();
    const { walletId: bobWallet } = await signIn(bob, createTestWallet());
    for (const id of [bobWallet, "0123456789abcdef01234567", "xyz"]) {
      const result = await unlink(alice, id);
      expect(result.status).toBe(404);
      expect(result.json).toEqual({ code: "NOT_FOUND", message: "Not found" });
    }
  });
});
