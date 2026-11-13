import { Collection } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDb,
  ensureIndexesOnce,
  getDb,
  registerIndexes,
  resetIndexRegistryForTests,
} from "@/modules/database";
import { InternalError } from "@/modules/shared";

const PROBE = "once_probe";

beforeEach(async () => {
  resetIndexRegistryForTests();
  await (await getDb()).dropCollection(PROBE).catch(() => undefined);
});

describe("ensureIndexesOnce", () => {
  it("shares one run between concurrent callers and memoizes success", async () => {
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    const spy = vi.spyOn(Collection.prototype, "createIndexes");
    await Promise.all([ensureIndexesOnce(), ensureIndexesOnce(), ensureIndexesOnce()]);
    await ensureIndexesOnce();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("re-runs after a new spec name is registered, but not for an identical one", async () => {
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    const spy = vi.spyOn(Collection.prototype, "createIndexes");
    await ensureIndexesOnce();
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    await ensureIndexesOnce();
    expect(spy).toHaveBeenCalledTimes(1);
    registerIndexes(PROBE, [{ name: "once_other", key: { other: 1 } }]);
    await ensureIndexesOnce();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("clears the memo after a rejection so the next call retries", async () => {
    const db = await getDb();
    await db.collection(PROBE).createIndex({ other: 1 }, { name: "once_ref" });
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    const error: unknown = await ensureIndexesOnce().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe("INDEX_CONFLICT");
    await db.collection(PROBE).dropIndex("once_ref");
    await expect(ensureIndexesOnce()).resolves.toBeUndefined();
  });

  it("is cleared by closeDb()", async () => {
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    const spy = vi.spyOn(Collection.prototype, "createIndexes");
    await ensureIndexesOnce();
    await closeDb();
    await ensureIndexesOnce();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("is cleared by resetIndexRegistryForTests()", async () => {
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    const spy = vi.spyOn(Collection.prototype, "createIndexes");
    await ensureIndexesOnce();
    resetIndexRegistryForTests();
    registerIndexes(PROBE, [{ name: "once_ref", key: { ref: 1 } }]);
    await ensureIndexesOnce();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
