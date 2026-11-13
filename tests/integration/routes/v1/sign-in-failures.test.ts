import { afterEach, describe, expect, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import { getDb, parseObjectId } from "@/modules/database";
import { requestChallenge, signIn, verify } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { useEnv } from "../../../helpers/env";
import { TestClient } from "../../../helpers/http";

const AUTH_FAILED = { code: "AUTH_FAILED", message: "Authentication failed" };

let restoreEnv: (() => void) | undefined;

afterEach(() => {
  restoreEnv?.();
  restoreEnv = undefined;
});

describe("POST /auth/verify failures", () => {
  it("rejects a replay of a consumed challenge with 401 AUTH_FAILED", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const { challenge, signature } = await signIn(client, wallet);
    const replay = await verify(new TestClient(), challenge, signature);
    expect(replay.status).toBe(401);
    expect(replay.json).toEqual(AUTH_FAILED);
    expect(replay.setCookies).toEqual([]);
  });

  it("rejects an expired challenge (clock + 301 s)", async () => {
    const clock = useTestClock(new Date("2026-11-13T10:00:00.000Z"));
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet);
    clock.advance(301_000);
    const result = await verify(client, challenge, wallet.sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual(AUTH_FAILED);
  });

  it("rejects a signature from another key", async () => {
    const client = new TestClient();
    const challenge = await requestChallenge(client, createTestWallet());
    const result = await verify(client, challenge, createTestWallet().sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual(AUTH_FAILED);
  });

  it("rejects a signature over a tampered message (Chain ID changed to mainnet-beta)", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet, "devnet");
    const tampered = challenge.message.replace("solana:devnet", "solana:mainnet-beta");
    const result = await verify(client, challenge, wallet.sign(tampered));
    expect(result.status).toBe(401);
    expect(result.json).toEqual(AUTH_FAILED);
  });

  it("rejects a link challenge used at /auth/verify (wrong purpose)", async () => {
    const wallet = createTestWallet();
    const owner = new TestClient();
    await signIn(owner, wallet);
    const db = await getDb();
    const challenge = await requestChallenge(new TestClient(), createTestWallet());
    await db
      .collection("auth_challenges")
      .updateOne(
        { _id: parseObjectId(challenge.challengeId) ?? undefined },
        { $set: { purpose: "link" } },
      );
    const result = await verify(new TestClient(), challenge, wallet.sign(challenge.message));
    expect(result.status).toBe(401);
  });

  it("rejects a well-formed but unknown challengeId with 401", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet);
    const unknown = { ...challenge, challengeId: "0123456789abcdef01234567" };
    const result = await verify(client, unknown, wallet.sign(challenge.message));
    expect(result.status).toBe(401);
  });

  it("rejects a suspended user with 401 AUTH_FAILED", async () => {
    const wallet = createTestWallet();
    const { userId } = await signIn(new TestClient(), wallet);
    await (
      await getDb()
    )
      .collection("users")
      .updateOne({ _id: parseObjectId(userId) ?? undefined }, { $set: { status: "suspended" } });
    const client = new TestClient();
    const challenge = await requestChallenge(client, wallet);
    const result = await verify(client, challenge, wallet.sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual(AUTH_FAILED);
  });

  it("lets exactly one of two concurrent verifies of one challenge succeed", async () => {
    const wallet = createTestWallet();
    const challenge = await requestChallenge(new TestClient(), wallet);
    const signature = wallet.sign(challenge.message);
    const results = await Promise.all([
      verify(new TestClient(), challenge, signature),
      verify(new TestClient(), challenge, signature),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await (await getDb()).collection("sessions").countDocuments({})).toBeGreaterThan(0);
  });

  it("serializes two concurrent first sign-ins of one new wallet into one user", async () => {
    const wallet = createTestWallet();
    const first = await requestChallenge(new TestClient(), wallet);
    const second = await requestChallenge(new TestClient(), wallet);
    const results = await Promise.all([
      verify(new TestClient(), first, wallet.sign(first.message)),
      verify(new TestClient(), second, wallet.sign(second.message)),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const ids = results.map((r) => (r.json as { user: { id: string } }).user.id);
    expect(ids[0]).toBe(ids[1]);
  });
});

describe("POST /auth/challenge network rules", () => {
  it("rejects testnet with 400 NETWORK_UNSUPPORTED", async () => {
    const result = await new TestClient().call(challengeRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/challenge",
      body: { address: createTestWallet().address, network: "testnet" },
    });
    expect(result.status).toBe(400);
    expect(result.json).toEqual({ code: "NETWORK_UNSUPPORTED", message: "Network not supported" });
  });

  it("rejects mainnet-beta when SOLANA_NETWORKS=devnet", async () => {
    restoreEnv = useEnv({ SOLANA_NETWORKS: "devnet" });
    const result = await new TestClient().call(challengeRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/challenge",
      body: { address: createTestWallet().address, network: "mainnet-beta" },
    });
    expect(result.status).toBe(400);
    expect(result.json).toEqual({ code: "NETWORK_UNSUPPORTED", message: "Network not supported" });
  });

  it("accepts mainnet-beta by default and states the network in the response", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet, "mainnet-beta");
    const result = await verify(client, challenge, wallet.sign(challenge.message));
    expect(result.status).toBe(200);
    expect((result.json as { wallet: { network: string } }).wallet.network).toBe("mainnet-beta");
  });

  it("fails a mainnet-beta challenge at verify once mainnet-beta is removed from the allowlist", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet, "mainnet-beta");
    restoreEnv = useEnv({ SOLANA_NETWORKS: "devnet" });
    const result = await verify(client, challenge, wallet.sign(challenge.message));
    expect(result.status).toBe(401);
    expect(result.json).toEqual(AUTH_FAILED);
  });
});

describe("session cookie attributes", () => {
  it("issues gw_session without Secure when APP_ORIGIN is http", async () => {
    restoreEnv = useEnv({ APP_ORIGIN: "http://localhost:3000" });
    const client = new TestClient({ appOrigin: "http://localhost:3000" });
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet);
    expect(challenge.message.startsWith("localhost:3000 wants you to sign in")).toBe(true);
    expect(challenge.message).toContain("URI: http://localhost:3000");
    const result = await verify(client, challenge, wallet.sign(challenge.message));
    expect(result.setCookies[0]).toMatch(
      /^gw_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; HttpOnly; SameSite=Lax$/,
    );
  });
});
