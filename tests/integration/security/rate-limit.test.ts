import { beforeAll, describe, expect, it } from "vitest";
import { ensureIndexes, getDb } from "@/modules/database";
import { rateLimit, registerSecurityIndexes, sha256Hex } from "@/modules/security";
import { RateLimitedError } from "@/modules/shared";

const AT = new Date("2026-11-13T10:00:30.000Z");

async function rateLimitDocs(key: string) {
  return (await getDb())
    .collection("rate_limits")
    .find({ key: sha256Hex(key) })
    .toArray();
}

beforeAll(async () => {
  registerSecurityIndexes();
  await ensureIndexes();
});

describe("rateLimit", () => {
  it("allows `limit` hits and rejects the next one with the seconds left in the window", async () => {
    for (let i = 0; i < 3; i += 1) await rateLimit("t1:ip:unknown", 3, 60, AT);
    const error: unknown = await rateLimit("t1:ip:unknown", 3, 60, AT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSeconds).toBe(30);
    const [doc] = await rateLimitDocs("t1:ip:unknown");
    expect(doc?.count).toBe(4);
  });

  it("stores only the SHA-256 of the key, with expiresAt at the window end", async () => {
    await rateLimit("t2:ip:203.0.113.9", 5, 60, AT);
    const all = await (await getDb()).collection("rate_limits").find({}).toArray();
    expect(JSON.stringify(all)).not.toContain("203.0.113.9");
    const [doc] = await rateLimitDocs("t2:ip:203.0.113.9");
    expect(doc?.windowStart).toEqual(new Date("2026-11-13T10:00:00.000Z"));
    expect(doc?.expiresAt).toEqual(new Date("2026-11-13T10:01:00.000Z"));
  });

  it("counts 25 concurrent first hits of a new window exactly, without a ConflictError", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => rateLimit("t3:ip:unknown", 1000, 60, AT)),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const docs = await rateLimitDocs("t3:ip:unknown");
    expect(docs).toHaveLength(1);
    expect(docs[0]?.count).toBe(25);
  });

  it("resets in the next window", async () => {
    await rateLimit("t4:ip:unknown", 1, 60, AT);
    await expect(rateLimit("t4:ip:unknown", 1, 60, AT)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(
      rateLimit("t4:ip:unknown", 1, 60, new Date("2026-11-13T10:01:00.000Z")),
    ).resolves.toBeUndefined();
  });

  it("keeps separate buckets per key", async () => {
    await rateLimit("t5:ip:a", 1, 60, AT);
    await expect(rateLimit("t5:ip:b", 1, 60, AT)).resolves.toBeUndefined();
  });

  it("records a rate_limited security event with a static reason", async () => {
    await rateLimit("t6:ip:unknown", 1, 60, AT);
    await rateLimit("t6:ip:unknown", 1, 60, AT).catch(() => undefined);
    const event = await (
      await getDb()
    )
      .collection("security_events")
      .findOne({ type: "rate_limited" });
    expect(event).toMatchObject({
      severity: "warning",
      reason: "rate_limit_exceeded",
      userId: null,
      walletId: null,
    });
  });

  it("throws RangeError for an invalid limit", async () => {
    await expect(rateLimit("t7:ip:unknown", 0, 60, AT)).rejects.toBeInstanceOf(RangeError);
  });
});
