import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureIndexes,
  getDb,
  registerIndexes,
  resetIndexRegistryForTests,
  type IndexSpec,
} from "@/modules/database";
import { InternalError } from "@/modules/shared";

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

const BY_REF: IndexSpec = { name: "by_ref_unique", key: { ref: 1 }, unique: true };

beforeEach(() => {
  resetIndexRegistryForTests();
});

describe("registerIndexes", () => {
  it("is a no-op when the identical spec is registered again", () => {
    registerIndexes("index_probe", [BY_REF]);
    expect(() => registerIndexes("index_probe", [{ ...BY_REF, key: { ref: 1 } }])).not.toThrow();
  });

  it("throws INDEX_REGISTRY_CONFLICT when a name is re-registered with a different spec", () => {
    registerIndexes("index_probe", [BY_REF]);
    const error = thrownBy(() =>
      registerIndexes("index_probe", [{ ...BY_REF, key: { other: 1 } }]),
    );
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe("INDEX_REGISTRY_CONFLICT");
  });

  it.each([
    {
      label: "collection name",
      collection: "BadName",
      spec: BY_REF,
      code: "COLLECTION_NAME_INVALID",
    },
    {
      label: "index name",
      collection: "index_probe",
      spec: { ...BY_REF, name: "has space" },
      code: "INDEX_SPEC_INVALID",
    },
    {
      label: "empty key",
      collection: "index_probe",
      spec: { ...BY_REF, key: {} },
      code: "INDEX_SPEC_INVALID",
    },
    {
      label: "direction",
      collection: "index_probe",
      spec: { ...BY_REF, key: { ref: 2 as unknown as 1 } },
      code: "INDEX_SPEC_INVALID",
    },
    {
      label: "TTL",
      collection: "index_probe",
      spec: { ...BY_REF, expireAfterSeconds: -1 },
      code: "INDEX_SPEC_INVALID",
    },
  ])("rejects an invalid $label with $code", ({ collection, spec, code }) => {
    const error = thrownBy(() => registerIndexes(collection, [spec]));
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe(code);
  });

  it("registers nothing when any spec in the call is invalid", async () => {
    expect(() =>
      registerIndexes("atomic_probe", [BY_REF, { ...BY_REF, name: "bad name" }]),
    ).toThrow(InternalError);
    await ensureIndexes();
    const db = await getDb();
    expect(await db.listCollections({ name: "atomic_probe" }).toArray()).toEqual([]);
  });
});

describe("ensureIndexes", () => {
  it("creates every registered index and is idempotent", async () => {
    registerIndexes("index_probe", [BY_REF]);
    await ensureIndexes();
    await ensureIndexes();
    const indexes = await (await getDb()).collection("index_probe").indexes();
    const byRef = indexes.filter((i) => i.name === "by_ref_unique");
    expect(byRef).toHaveLength(1);
    expect(byRef[0]?.unique).toBe(true);
    expect(byRef[0]?.key).toEqual({ ref: 1 });
  });

  it("throws INDEX_CONFLICT when the server holds a different index under the same name", async () => {
    registerIndexes("index_conflict_probe", [{ name: "by_ref", key: { ref: 1 } }]);
    await ensureIndexes();
    resetIndexRegistryForTests();
    registerIndexes("index_conflict_probe", [{ name: "by_ref", key: { ref: -1 } }]);
    const error: unknown = await ensureIndexes().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe("INDEX_CONFLICT");
  });

  it("resolves when nothing is registered", async () => {
    await expect(ensureIndexes()).resolves.toBeUndefined();
  });
});
