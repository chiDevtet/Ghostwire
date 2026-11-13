import { beforeAll, describe, expect, it } from "vitest";
import { ensureAuthReady } from "@/modules/auth";
import { getDb } from "@/modules/database";

interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  expireAfterSeconds?: number;
}

async function indexesOf(collection: string): Promise<IndexInfo[]> {
  const list = (await (
    await getDb()
  )
    .collection(collection)
    .listIndexes()
    .toArray()) as IndexInfo[];
  return list
    .filter((index) => index.name !== "_id_")
    .map(({ name, key, unique, expireAfterSeconds }) => ({
      name,
      key,
      ...(unique === undefined ? {} : { unique }),
      ...(expireAfterSeconds === undefined ? {} : { expireAfterSeconds }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

beforeAll(async () => {
  await ensureAuthReady();
});

describe("ensureAuthReady", () => {
  it.each([
    {
      collection: "wallets",
      expected: [
        { name: "wallets_address_network_unique", key: { address: 1, network: 1 }, unique: true },
        { name: "wallets_userId", key: { userId: 1 } },
      ],
    },
    {
      collection: "auth_challenges",
      expected: [
        { name: "auth_challenges_expiresAt_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 3600 },
        { name: "auth_challenges_nonceHash_unique", key: { nonceHash: 1 }, unique: true },
      ],
    },
    {
      collection: "sessions",
      expected: [
        {
          name: "sessions_absoluteExpiresAt_ttl",
          key: { absoluteExpiresAt: 1 },
          expireAfterSeconds: 0,
        },
        { name: "sessions_tokenHash_unique", key: { tokenHash: 1 }, unique: true },
        { name: "sessions_userId", key: { userId: 1 } },
      ],
    },
    {
      collection: "rate_limits",
      expected: [
        { name: "rate_limits_expiresAt_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
        {
          name: "rate_limits_key_windowStart_unique",
          key: { key: 1, windowStart: 1 },
          unique: true,
        },
      ],
    },
    {
      collection: "security_events",
      expected: [{ name: "security_events_userId_createdAt", key: { userId: 1, createdAt: -1 } }],
    },
  ])("creates exactly the $collection indexes", async ({ collection, expected }) => {
    expect(await indexesOf(collection)).toEqual(expected);
  });

  it("is idempotent", async () => {
    await expect(ensureAuthReady()).resolves.toBeUndefined();
    await expect(ensureAuthReady()).resolves.toBeUndefined();
  });
});
