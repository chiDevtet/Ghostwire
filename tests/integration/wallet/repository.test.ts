import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureAuthReady } from "@/modules/auth";
import { getDb, parseObjectId, withTransaction, type ObjectId } from "@/modules/database";
import { ConflictError } from "@/modules/shared";
import {
  countActiveWallets,
  findWalletByAddress,
  findWalletForUser,
  insertWallet,
  listWalletsByUser,
  parseSolanaAddress,
  setWalletStatus,
  toWalletView,
  touchWallet,
} from "@/modules/wallet";
import { createTestWallet } from "../../helpers/ed25519";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const T1 = new Date("2026-11-13T11:00:00.000Z");

function oid(hex: string): ObjectId {
  const id = parseObjectId(hex);
  if (id === null) throw new Error(`bad fixture id ${hex}`);
  return id;
}

const USER_A = oid("64b7f0c2a1b2c3d4e5f60701");
const USER_B = oid("64b7f0c2a1b2c3d4e5f60702");

function newAddress() {
  return parseSolanaAddress(createTestWallet().address);
}

async function insert(userId: ObjectId, at = T0, network: "devnet" | "mainnet-beta" = "devnet") {
  const address = newAddress();
  const doc = await withTransaction((session) =>
    insertWallet({ userId, address, network, provider: "phantom", at }, { session }),
  );
  return { address, doc };
}

beforeAll(async () => {
  await ensureAuthReady();
});

beforeEach(async () => {
  await (await getDb()).collection("wallets").deleteMany({});
});

describe("wallet repository", () => {
  it("inserts an active external wallet and finds it by (address, network)", async () => {
    const { address, doc } = await insert(USER_A);
    expect(doc).toMatchObject({
      userId: USER_A,
      address,
      network: "devnet",
      walletType: "external",
      provider: "phantom",
      status: "active",
      linkedAt: T0,
      updatedAt: T0,
    });
    expect(await findWalletByAddress(address, "devnet")).toEqual(doc);
    expect(await findWalletByAddress(address, "mainnet-beta")).toBeNull();
  });

  it("allows the same address on another network but not twice on one network", async () => {
    const { address } = await insert(USER_A);
    await expect(
      withTransaction((session) =>
        insertWallet(
          { userId: USER_B, address, network: "mainnet-beta", provider: null, at: T0 },
          { session },
        ),
      ),
    ).resolves.toMatchObject({ network: "mainnet-beta" });
    const error: unknown = await withTransaction((session) =>
      insertWallet(
        { userId: USER_B, address, network: "devnet", provider: null, at: T0 },
        { session },
      ),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe("DUPLICATE_KEY");
  });

  it("finds a wallet for its owner only", async () => {
    const { doc } = await insert(USER_A);
    expect(await findWalletForUser(doc._id, USER_A)).toEqual(doc);
    expect(await findWalletForUser(doc._id, USER_B)).toBeNull();
  });

  it("lists a user's wallets by linkedAt and counts the active ones", async () => {
    const second = await insert(USER_A, T1);
    const first = await insert(USER_A, T0);
    await insert(USER_B, T0);
    const listed = await listWalletsByUser(USER_A);
    expect(listed.map((w) => w._id.toHexString())).toEqual([
      first.doc._id.toHexString(),
      second.doc._id.toHexString(),
    ]);
    const active = await withTransaction((session) => countActiveWallets(USER_A, { session }));
    expect(active).toBe(2);
  });

  it("disconnects, then reactivates with linkedAt and provider reset", async () => {
    const { doc } = await insert(USER_A);
    const off = await withTransaction((session) =>
      setWalletStatus(doc._id, "disconnected", T1, { session }),
    );
    expect(off).toMatchObject({ status: "disconnected", updatedAt: T1, linkedAt: T0 });
    expect(await withTransaction((session) => countActiveWallets(USER_A, { session }))).toBe(0);
    const later = new Date("2026-11-13T12:00:00.000Z");
    const on = await withTransaction((session) =>
      setWalletStatus(doc._id, "active", later, { session, provider: "solflare" }),
    );
    expect(on).toMatchObject({ status: "active", linkedAt: later, provider: "solflare" });
  });

  it("touchWallet writes only updatedAt", async () => {
    const { doc } = await insert(USER_A);
    const touched = await withTransaction((session) => touchWallet(doc._id, T1, { session }));
    expect(touched).toEqual({ ...doc, updatedAt: T1 });
  });

  it("returns null when updating a wallet that does not exist", async () => {
    const missing = oid("64b7f0c2a1b2c3d4e5f607ff");
    expect(await withTransaction((session) => touchWallet(missing, T1, { session }))).toBeNull();
  });

  it("maps a wallet to its API view", async () => {
    const { address, doc } = await insert(USER_A);
    expect(toWalletView(doc)).toEqual({
      id: doc._id.toHexString(),
      address,
      network: "devnet",
      provider: "phantom",
      status: "active",
      linkedAt: "2026-11-13T10:00:00.000Z",
    });
  });
});
