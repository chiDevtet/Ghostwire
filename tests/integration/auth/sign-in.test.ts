import { beforeEach, describe, expect, it } from "vitest";
import {
  issueChallenge,
  resolveSession,
  verifySignIn,
  type ChallengeView,
  type RequestMeta,
} from "@/modules/auth";
import { getDb, parseObjectId } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { AuthFailedError, ValidationError } from "@/modules/shared";
import { buildSignInMessage, parseSignInMessage } from "@/modules/wallet";
import { useEnv } from "../../helpers/env";
import { createTestWallet, type TestWallet } from "../../helpers/ed25519";

const T0 = new Date("2026-11-13T10:00:00.000Z");

function meta(at: Date = T0): RequestMeta {
  return { at, ip: "unknown", userAgent: "vitest" };
}

function tokenOf(setCookie: string): string {
  const match = /^__Host-gw_session=([A-Za-z0-9_-]{43});/.exec(setCookie);
  if (match?.[1] === undefined) throw new Error(`no session token in ${setCookie}`);
  return match[1];
}

async function challengeFor(wallet: TestWallet, network = "devnet"): Promise<ChallengeView> {
  return issueChallenge({ address: wallet.address, network }, meta());
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((e: unknown) => e);
}

beforeEach(async () => {
  const db = await getDb();
  for (const name of ["users", "wallets", "auth_challenges", "sessions", "security_events"]) {
    await db.collection(name).deleteMany({});
  }
});

describe("issueChallenge", () => {
  it("stores the challenge with only the nonce hash and returns the exact message", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    expect(view.challengeId).toMatch(/^[0-9a-f]{24}$/);
    expect(view.expiresAt).toBe("2026-11-13T10:05:00.000Z");
    const fields = parseSignInMessage(view.message);
    expect(fields).not.toBeNull();
    expect(view.message).toBe(
      buildSignInMessage({
        purpose: "signin",
        domain: "ghostwire.test",
        address: wallet.address as never,
        uri: "https://ghostwire.test",
        network: "devnet",
        nonce: fields?.nonce ?? "",
        issuedAt: T0,
        expiresAt: new Date("2026-11-13T10:05:00.000Z"),
      }),
    );
    const stored = await (
      await getDb()
    )
      .collection("auth_challenges")
      .findOne({ _id: parseObjectId(view.challengeId) ?? undefined });
    expect(stored).toMatchObject({
      nonceHash: sha256Hex(fields?.nonce ?? ""),
      message: view.message,
      address: wallet.address,
      network: "devnet",
      purpose: "signin",
      userId: null,
      createdAt: T0,
      consumedAt: null,
    });
    expect(Object.values(stored ?? {})).not.toContain(fields?.nonce);
  });

  it("rejects a malformed address and an unsupported network", async () => {
    const bad = await errorOf(issueChallenge({ address: "0x123", network: "devnet" }, meta()));
    expect(bad).toBeInstanceOf(ValidationError);
    expect((bad as ValidationError).code).toBe("VALIDATION_FAILED");
    const testnet = await errorOf(challengeFor(createTestWallet(), "testnet"));
    expect((testnet as ValidationError).code).toBe("NETWORK_UNSUPPORTED");
    const nonString = await errorOf(
      issueChallenge({ address: createTestWallet().address, network: 1 }, meta()),
    );
    expect((nonString as ValidationError).code).toBe("VALIDATION_FAILED");
  });
});

describe("verifySignIn", () => {
  it("creates the user, wallet and session on first sign-in", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    const result = await verifySignIn(
      { challengeId: view.challengeId, signature: wallet.sign(view.message), provider: "phantom" },
      meta(),
    );
    expect(result.body.wallet).toMatchObject({ address: wallet.address, network: "devnet" });
    expect(result.setCookie).toMatch(
      /^__Host-gw_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/,
    );
    const token = tokenOf(result.setCookie);
    const db = await getDb();
    const session = await db.collection("sessions").findOne({ tokenHash: sha256Hex(token) });
    expect(session).toMatchObject({
      network: "devnet",
      createdAt: T0,
      lastSeenAt: T0,
      expiresAt: new Date("2026-11-20T10:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-12-13T10:00:00.000Z"),
      revokedAt: null,
      userAgent: "vitest",
    });
    expect(session?.userId.toHexString()).toBe(result.body.user.id);
    const stored = await db.collection("wallets").findOne({ address: wallet.address });
    expect(stored).toMatchObject({ provider: "phantom", status: "active", walletType: "external" });
    const events = await db.collection("security_events").find({}).toArray();
    expect(events.map((e) => e.type)).toEqual(["signin_success"]);
  });

  it("signs the same wallet in to the same user without resetting linkedAt", async () => {
    const wallet = createTestWallet();
    const first = await challengeFor(wallet);
    const one = await verifySignIn(
      { challengeId: first.challengeId, signature: wallet.sign(first.message) },
      meta(),
    );
    const later = new Date("2026-11-14T10:00:00.000Z");
    const second = await issueChallenge(
      { address: wallet.address, network: "devnet" },
      meta(later),
    );
    const two = await verifySignIn(
      { challengeId: second.challengeId, signature: wallet.sign(second.message) },
      meta(later),
    );
    expect(two.body.user.id).toBe(one.body.user.id);
    expect(two.body.wallet.id).toBe(one.body.wallet.id);
    const stored = await (await getDb()).collection("wallets").findOne({ address: wallet.address });
    expect(stored).toMatchObject({ linkedAt: T0, updatedAt: later });
    expect(await (await getDb()).collection("users").countDocuments({})).toBe(1);
  });

  it("burns the challenge on a bad signature and records signin_failed", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    const forged = await errorOf(
      verifySignIn(
        { challengeId: view.challengeId, signature: createTestWallet().sign(view.message) },
        meta(),
      ),
    );
    expect(forged).toBeInstanceOf(AuthFailedError);
    expect((forged as AuthFailedError).reason).toBe("signature_invalid");
    const replay = await errorOf(
      verifySignIn({ challengeId: view.challengeId, signature: wallet.sign(view.message) }, meta()),
    );
    expect((replay as AuthFailedError).reason).toBe("challenge_unavailable");
    const reasons = (await (await getDb()).collection("security_events").find({}).toArray()).map(
      (e) => [e.type, e.reason],
    );
    expect(reasons).toEqual([
      ["signin_failed", "signature_invalid"],
      ["signin_failed", "challenge_unavailable"],
    ]);
  });

  it("rejects an expired challenge", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    const error = await errorOf(
      verifySignIn(
        { challengeId: view.challengeId, signature: wallet.sign(view.message) },
        meta(new Date("2026-11-13T10:05:00.000Z")),
      ),
    );
    expect((error as AuthFailedError).reason).toBe("challenge_unavailable");
  });

  it("rejects a malformed body before touching the challenge", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    for (const body of [
      { challengeId: "nope", signature: wallet.sign(view.message) },
      { challengeId: view.challengeId, signature: "0OIl" },
      { challengeId: view.challengeId, signature: wallet.sign(view.message), provider: "Bad!" },
      { challengeId: view.challengeId, signature: wallet.sign(view.message), extra: 1 },
    ]) {
      expect(await errorOf(verifySignIn(body, meta()))).toBeInstanceOf(ValidationError);
    }
    await expect(
      verifySignIn({ challengeId: view.challengeId, signature: wallet.sign(view.message) }, meta()),
    ).resolves.toBeDefined();
  });

  it("rejects a suspended user", async () => {
    const wallet = createTestWallet();
    const first = await challengeFor(wallet);
    const one = await verifySignIn(
      { challengeId: first.challengeId, signature: wallet.sign(first.message) },
      meta(),
    );
    await (
      await getDb()
    )
      .collection("users")
      .updateOne(
        { _id: parseObjectId(one.body.user.id) ?? undefined },
        { $set: { status: "suspended" } },
      );
    const second = await challengeFor(wallet);
    const error = await errorOf(
      verifySignIn(
        { challengeId: second.challengeId, signature: wallet.sign(second.message) },
        meta(),
      ),
    );
    expect((error as AuthFailedError).reason).toBe("user_inactive");
  });

  it("returns a session token that resolves", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    const result = await verifySignIn(
      { challengeId: view.challengeId, signature: wallet.sign(view.message) },
      meta(),
    );
    const resolution = await resolveSession(tokenOf(result.setCookie), T0);
    expect(resolution?.session.userId.toHexString()).toBe(result.body.user.id);
    expect(resolution?.slid).toBe(false);
  });
});

describe("challenge ids", () => {
  it("are random, not the driver's sequential ObjectIds", async () => {
    const wallet = createTestWallet();
    const a = await challengeFor(wallet);
    const b = await challengeFor(wallet);
    const counter = (id: string) => Number.parseInt(id.slice(18), 16);
    expect(a.challengeId).not.toBe(b.challengeId);
    expect(a.challengeId.slice(8, 18)).not.toBe(b.challengeId.slice(8, 18));
    expect(counter(b.challengeId) - counter(a.challengeId)).not.toBe(1);
  });
});

describe("verifySignIn concurrency and edge branches", () => {
  async function eventReasons(): Promise<unknown[]> {
    const events = await (await getDb()).collection("security_events").find({}).toArray();
    return events.map((e) => e.reason);
  }

  it("lets exactly one of five concurrent verifies on one challenge succeed", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    const body = { challengeId: view.challengeId, signature: wallet.sign(view.message) };
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => verifySignIn(body, meta())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(4);
    for (const failure of failures) expect(failure.reason).toBeInstanceOf(AuthFailedError);
    expect(await (await getDb()).collection("sessions").countDocuments({})).toBe(1);
  });

  it("creates one user and one wallet when two challenges race the first sign-in", async () => {
    const wallet = createTestWallet();
    const [one, two] = await Promise.all([challengeFor(wallet), challengeFor(wallet)]);
    const results = await Promise.all(
      [one, two].map((view) =>
        verifySignIn(
          { challengeId: view.challengeId, signature: wallet.sign(view.message) },
          meta(),
        ),
      ),
    );
    expect(results[0]?.body.user.id).toBe(results[1]?.body.user.id);
    const db = await getDb();
    expect(await db.collection("users").countDocuments({})).toBe(1);
    expect(await db.collection("wallets").countDocuments({})).toBe(1);
    expect(await db.collection("sessions").countDocuments({})).toBe(2);
  });

  it("reactivates a disconnected wallet for the same user", async () => {
    const wallet = createTestWallet();
    const first = await challengeFor(wallet);
    const one = await verifySignIn(
      { challengeId: first.challengeId, signature: wallet.sign(first.message) },
      meta(),
    );
    const db = await getDb();
    await db
      .collection("wallets")
      .updateOne({ address: wallet.address }, { $set: { status: "disconnected" } });
    const second = await challengeFor(wallet);
    const two = await verifySignIn(
      { challengeId: second.challengeId, signature: wallet.sign(second.message) },
      meta(),
    );
    expect(two.body.user.id).toBe(one.body.user.id);
    expect(await db.collection("wallets").findOne({ address: wallet.address })).toMatchObject({
      status: "active",
    });
  });

  it("fails message_integrity when the stored message was tampered with", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet);
    await (
      await getDb()
    )
      .collection("auth_challenges")
      .updateOne(
        { _id: parseObjectId(view.challengeId) ?? undefined },
        { $set: { message: `${view.message}x` } },
      );
    const error = await errorOf(
      verifySignIn({ challengeId: view.challengeId, signature: wallet.sign(view.message) }, meta()),
    );
    expect(error).toBeInstanceOf(AuthFailedError);
    expect((error as AuthFailedError).reason).toBe("message_integrity");
    expect(await eventReasons()).toEqual(["message_integrity"]);
  });

  it("fails network_unsupported when the network was removed from config after issue", async () => {
    const wallet = createTestWallet();
    const view = await challengeFor(wallet, "mainnet-beta");
    const restore = useEnv({ SOLANA_NETWORKS: "devnet" });
    try {
      const error = await errorOf(
        verifySignIn(
          { challengeId: view.challengeId, signature: wallet.sign(view.message) },
          meta(),
        ),
      );
      expect((error as AuthFailedError).reason).toBe("network_unsupported");
    } finally {
      restore();
    }
    expect(await eventReasons()).toEqual(["network_unsupported"]);
  });
});
