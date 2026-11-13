import { Collection } from "mongodb";
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { z } from "zod";
import { getDb, safeEquals, typedCollection, withTransaction } from "@/modules/database";
import {
  ConflictError,
  createLogger,
  DependencyUnavailableError,
  InternalError,
  ValidationError,
} from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const COLLECTION = "typed_probe";
const strictSchema = z.strictObject({ ref: z.string().min(1), amount: z.string() });
const counterSchema = z.strictObject({
  ref: z.string().min(1),
  count: z.number().int().min(1),
  note: z.string().max(8),
});

async function raw() {
  return (await getDb()).collection(COLLECTION);
}

beforeAll(async () => {
  await (await getDb()).createCollection(COLLECTION);
});

beforeEach(async () => {
  await (await raw()).deleteMany({});
});

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("typedCollection", () => {
  it("rejects invalid documents with DOCUMENT_INVALID and writes nothing", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const error: unknown = await probes
      .insertOne({ ref: "", amount: "1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("DOCUMENT_INVALID");
    expect((error as ValidationError).safeMessage).toBe("Invalid document");
    expect(await (await raw()).countDocuments({})).toBe(0);
  });

  it("names the collection and failing paths but not the values", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const error = (await probes
      .insertOne({ ref: "SENTINEL-REF", amount: 5 as unknown as string })
      .catch((e: unknown) => e)) as ValidationError;
    expect(error.message).toContain(COLLECTION);
    expect(error.message).toContain("amount");
    expect(error.message).not.toContain("SENTINEL-REF");
  });

  it("rejects unknown keys with a strict schema", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const doc = { ref: "a", amount: "1", extra: true };
    await expect(probes.insertOne(doc)).rejects.toBeInstanceOf(ValidationError);
  });

  it("inserts the parsed output and reads it back parsed", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const inserted = await probes.insertOne({ ref: "a", amount: "100" });
    expect(inserted).toMatchObject({ ref: "a", amount: "100" });
    expect(inserted._id).toBeDefined();
    expect(await probes.findOne({ ref: "a" })).toEqual(inserted);
  });

  it("strips unknown keys with a non-strict schema", async () => {
    const loose = typedCollection(COLLECTION, z.object({ ref: z.string() }));
    const doc = { ref: "s", junk: "x" };
    await loose.insertOne(doc);
    const stored = await (await raw()).findOne({ ref: "s" });
    expect(stored).not.toHaveProperty("junk");
  });

  it("returns null from findOne when nothing matches", async () => {
    expect(await typedCollection(COLLECTION, strictSchema).findOne({ ref: "missing" })).toBeNull();
  });

  it("find is bounded, sorted and requires a limit in [1, 1000]", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    for (const ref of ["b", "a", "c"]) await probes.insertOne({ ref, amount: "1" });
    const found = await probes.find({}, { limit: 2, sort: { ref: 1 } });
    expect(found.map((d) => d.ref)).toEqual(["a", "b"]);
    for (const limit of [0, 1001, 1.5]) {
      await expect(probes.find({}, { limit })).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("reports stored documents that fail the schema as DATA_INTEGRITY", async () => {
    await (await raw()).insertOne({ ref: 5, amount: "1" });
    const probes = typedCollection(COLLECTION, strictSchema);
    for (const read of [() => probes.findOne({}), () => probes.find({}, { limit: 10 })]) {
      const error: unknown = await read().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InternalError);
      expect((error as InternalError).code).toBe("DATA_INTEGRITY");
    }
  });

  it("maps a duplicate key to ConflictError DUPLICATE_KEY", async () => {
    const db = await getDb();
    await db
      .collection("dup_probe")
      .createIndex({ ref: 1 }, { unique: true, name: "dup_ref_unique" });
    const dups = typedCollection("dup_probe", strictSchema);
    await dups.insertOne({ ref: "same", amount: "1" });
    const error: unknown = await dups
      .insertOne({ ref: "same", amount: "2" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe("DUPLICATE_KEY");
    expect((error as ConflictError).safeMessage).toBe("Resource already exists");
  });

  it("never puts the duplicated value or driver text into safeMessage, code or message", async () => {
    const db = await getDb();
    await db
      .collection("dup_secret_probe")
      .createIndex({ ref: 1 }, { unique: true, name: "dup_secret_unique" });
    const dups = typedCollection("dup_secret_probe", strictSchema);
    const secret = "SENTINEL-DUP-VALUE-9f3a";
    await dups.insertOne({ ref: secret, amount: "1" });
    const error = (await dups
      .insertOne({ ref: secret, amount: "2" })
      .catch((e: unknown) => e)) as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    for (const field of [error.safeMessage, error.code, error.message]) {
      expect(field).not.toContain(secret);
      expect(field).not.toContain("E11000");
      expect(field).not.toContain("dup_secret_unique");
    }
    const cause = error.cause as Error & { code?: number };
    expect(cause).toBeInstanceOf(Error);
    expect(cause.message).toBe("duplicate key");
    expect(cause.code).toBe(11000);
    for (const text of [cause.message, cause.stack ?? ""]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain("E11000");
    }
  });

  it("keeps the duplicated value out of a serialized log line", async () => {
    const db = await getDb();
    await db
      .collection("dup_log_probe")
      .createIndex({ ref: 1 }, { unique: true, name: "dup_log_unique" });
    const dups = typedCollection("dup_log_probe", strictSchema);
    const secret = "SENTINEL-LOG-VALUE-7c1d";
    await dups.insertOne({ ref: secret, amount: "1" });
    const err = await dups.insertOne({ ref: secret, amount: "2" }).catch((e: unknown) => e);
    const lines: string[] = [];
    const captured = createLogger({
      level: "debug",
      sink: { write: (_level, line) => void lines.push(line) },
    });
    captured.error("x", { err });
    expect(lines).toHaveLength(1);
    for (const needle of [secret, "E11000", "dup_log_unique", "dup key"]) {
      expect(lines[0]).not.toContain(needle);
    }
  });

  it("honours the session so a failed transaction persists nothing", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    await expect(
      withTransaction(async (session) => {
        await probes.insertOne({ ref: "t", amount: "1" }, { session });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await probes.findOne({ ref: "t" })).toBeNull();
  });

  it("rejects an invalid collection name synchronously", () => {
    expect(() => typedCollection("BadName", strictSchema)).toThrow(InternalError);
  });

  it("maps an unreachable server to DependencyUnavailableError", async () => {
    const standalone = await startStandalone();
    let stopped = false;
    try {
      await useDatabaseUri(standalone.getUri());
      const probes = typedCollection(COLLECTION, strictSchema);
      await probes.insertOne({ ref: "x", amount: "1" });
      await standalone.stop({ doCleanup: true });
      stopped = true;
      await expect(probes.findOne({ ref: "x" })).rejects.toBeInstanceOf(DependencyUnavailableError);
    } finally {
      if (!stopped) await standalone.stop({ doCleanup: true });
    }
  });
});

describe("typedCollection: maxTimeMS on every read, update and count (entry gate 4)", () => {
  it.each([
    "findOne",
    "find",
    "findOneAndUpdate",
    "updateOne",
    "updateMany",
    "countDocuments",
  ] as const)("%s passes maxTimeMS: 5000 to the driver", async (method) => {
    const spy = vi.spyOn(Collection.prototype, method);
    const probes = typedCollection(COLLECTION, counterSchema);
    const filter = safeEquals("ref", "m");
    if (method === "findOne") await probes.findOne(filter);
    if (method === "find") await probes.find(filter, { limit: 1 });
    if (method === "findOneAndUpdate")
      await probes.findOneAndUpdate(filter, { $set: { note: "x" } });
    if (method === "updateOne") await probes.updateOne(filter, { $set: { note: "x" } });
    if (method === "updateMany") await probes.updateMany(filter, { $set: { note: "x" } });
    if (method === "countDocuments") await probes.countDocuments(filter);
    expect(spy).toHaveBeenCalled();
    const options = spy.mock.calls[0]?.at(-1);
    expect(options).toMatchObject({ maxTimeMS: 5000 });
  });
});

describe("typedCollection: update operations", () => {
  const counters = () => typedCollection(COLLECTION, counterSchema);

  it("findOneAndUpdate upserts with $inc and $setOnInsert and returns the document after", async () => {
    const filter = safeEquals("ref", "c1");
    const update = { $inc: { count: 1 }, $setOnInsert: { note: "new" } };
    const first = await counters().findOneAndUpdate(filter, update, { upsert: true });
    const second = await counters().findOneAndUpdate(filter, update, { upsert: true });
    expect(first).toMatchObject({ ref: "c1", count: 1, note: "new" });
    expect(second).toMatchObject({ ref: "c1", count: 2, note: "new" });
    expect(second?._id.equals(first?._id ?? "")).toBe(true);
  });

  it("findOneAndUpdate returns null when nothing matches and upsert is off", async () => {
    expect(
      await counters().findOneAndUpdate(safeEquals("ref", "missing"), { $set: { note: "x" } }),
    ).toBeNull();
  });

  it("findOneAndUpdate can return the document before the update", async () => {
    await counters().insertOne({ ref: "b1", count: 1, note: "old" });
    const before = await counters().findOneAndUpdate(
      safeEquals("ref", "b1"),
      { $set: { note: "new" } },
      { returnDocument: "before" },
    );
    expect(before?.note).toBe("old");
  });

  it.each([
    { label: "an unknown $set key", update: { $set: { other: "x" } } },
    {
      label: "a $set value that fails the field schema",
      update: { $set: { note: "too-long-note" } },
    },
    { label: "an unknown $setOnInsert key", update: { $setOnInsert: { other: 1 } } },
    { label: "a non-integer $inc", update: { $inc: { count: 1.5 } } },
    { label: "an unknown $inc key", update: { $inc: { other: 1 } } },
    { label: "an empty update", update: {} },
  ])("rejects $label with DOCUMENT_INVALID and writes nothing", async ({ update }) => {
    await counters().insertOne({ ref: "v1", count: 1, note: "n" });
    const error: unknown = await counters()
      .updateOne(safeEquals("ref", "v1"), update as never)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("DOCUMENT_INVALID");
    expect(await counters().findOne(safeEquals("ref", "v1"))).toMatchObject({
      count: 1,
      note: "n",
    });
  });

  it("names the key but not the value in a DOCUMENT_INVALID message", async () => {
    const error = (await counters()
      .updateOne(safeEquals("ref", "x"), { $set: { note: "SENTINEL-TOO-LONG" } })
      .catch((e: unknown) => e)) as ValidationError;
    expect(error.message).toContain("$set.note");
    expect(error.message).not.toContain("SENTINEL");
  });

  it("updateOne reports matched, modified and upserted counts", async () => {
    await counters().insertOne({ ref: "u1", count: 1, note: "a" });
    expect(await counters().updateOne(safeEquals("ref", "u1"), { $set: { note: "b" } })).toEqual({
      matchedCount: 1,
      modifiedCount: 1,
      upsertedId: null,
    });
    const upserted = await counters().updateOne(
      safeEquals("ref", "u2"),
      { $setOnInsert: { count: 1, note: "c" } },
      { upsert: true },
    );
    expect(upserted.matchedCount).toBe(0);
    expect(upserted.upsertedId).not.toBeNull();
  });

  it("updateMany updates every match and countDocuments counts with an optional limit", async () => {
    for (const ref of ["m1", "m2", "m3"]) await counters().insertOne({ ref, count: 1, note: "a" });
    const result = await counters().updateMany({}, { $set: { note: "z" } });
    expect(result).toEqual({ matchedCount: 3, modifiedCount: 3 });
    expect(await counters().countDocuments({ note: "z" })).toBe(3);
    expect(await counters().countDocuments({}, { limit: 2 })).toBe(2);
    for (const limit of [0, 1001, 1.5]) {
      await expect(counters().countDocuments({}, { limit })).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("maps a duplicate key on update to ConflictError DUPLICATE_KEY", async () => {
    const db = await getDb();
    await db
      .collection("dup_update_probe")
      .createIndex({ ref: 1 }, { unique: true, name: "dup_update_unique" });
    const dups = typedCollection("dup_update_probe", counterSchema);
    await dups.insertOne({ ref: "a", count: 1, note: "n" });
    await dups.insertOne({ ref: "b", count: 1, note: "n" });
    const error: unknown = await dups
      .updateOne(safeEquals("ref", "b"), { $set: { ref: "a" } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe("DUPLICATE_KEY");
  });

  it("honours the session for updates inside a transaction", async () => {
    await counters().insertOne({ ref: "t1", count: 1, note: "a" });
    await expect(
      withTransaction(async (session) => {
        await counters().updateOne(safeEquals("ref", "t1"), { $inc: { count: 1 } }, { session });
        expect(await counters().countDocuments(safeEquals("count", 2), { session })).toBe(1);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await counters().findOne(safeEquals("ref", "t1"))).toMatchObject({ count: 1 });
  });
});
