import { ClientSession, MongoError } from "mongodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, withTransaction } from "@/modules/database";
import { ConflictError, DependencyUnavailableError } from "@/modules/shared";

const COLLECTION = "txn_probe";
const TRANSIENT = "TransientTransactionError";
const UNKNOWN_COMMIT = "UnknownTransactionCommitResult";

function labelled(label: string): MongoError {
  const error = new MongoError("simulated");
  error.addErrorLabel(label);
  return error;
}

async function probe() {
  return (await getDb()).collection<{ ref: string }>(COLLECTION);
}

beforeAll(async () => {
  // Create the collection outside any transaction (no catalog changes inside one).
  await (await getDb()).createCollection(COLLECTION);
});

beforeEach(async () => {
  await (await probe()).deleteMany({});
});

describe("withTransaction", () => {
  it("commits and returns fn's result", async () => {
    const coll = await probe();
    const result = await withTransaction(async (session) => {
      await coll.insertOne({ ref: "a" }, { session });
      return "done";
    });
    expect(result).toBe("done");
    expect(await coll.countDocuments({ ref: "a" })).toBe(1);
  });

  it("rolls back and rethrows the same error instance without retrying", async () => {
    const coll = await probe();
    const boom = new Error("boom");
    let calls = 0;
    const outcome = withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "b" }, { session });
      throw boom;
    });
    await expect(outcome).rejects.toBe(boom);
    expect(calls).toBe(1);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it("re-runs fn after a TransientTransactionError and discards the failed attempt", async () => {
    const coll = await probe();
    let calls = 0;
    const result = await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: `attempt-${calls}` }, { session });
      if (calls === 1) throw labelled(TRANSIENT);
      return calls;
    });
    expect(result).toBe(2);
    expect(calls).toBe(2);
    expect(await coll.find({}).map((d) => d.ref).toArray()).toEqual(["attempt-2"]);
  });

  it("throws DependencyUnavailableError with the labelled cause once attempts are exhausted", async () => {
    const transient = labelled(TRANSIENT);
    let calls = 0;
    const error: unknown = await withTransaction(async () => {
      calls += 1;
      throw transient;
    }).catch((e: unknown) => e);
    expect(calls).toBe(3);
    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as DependencyUnavailableError).cause).toBe(transient);
    expect((error as DependencyUnavailableError).safeMessage).toBe("Service temporarily unavailable");
  });

  it("honours maxAttempts", async () => {
    let calls = 0;
    const outcome = withTransaction(
      async () => {
        calls += 1;
        throw labelled(TRANSIENT);
      },
      { maxAttempts: 1 },
    );
    await expect(outcome).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(calls).toBe(1);
  });

  it("detects the label on a wrapped cause", async () => {
    let calls = 0;
    const result = await withTransaction(async () => {
      calls += 1;
      if (calls === 1) throw new ConflictError({ cause: labelled(TRANSIENT) });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry a plain Error or an unlabelled MongoError", async () => {
    for (const thrown of [new Error("plain"), new MongoError("unlabelled")]) {
      let calls = 0;
      const outcome = withTransaction(async () => {
        calls += 1;
        throw thrown;
      });
      await expect(outcome).rejects.toBe(thrown);
      expect(calls).toBe(1);
    }
  });

  it("retries only the commit on UnknownTransactionCommitResult", async () => {
    const coll = await probe();
    const commit = vi
      .spyOn(ClientSession.prototype, "commitTransaction")
      .mockImplementationOnce(async () => {
        throw labelled(UNKNOWN_COMMIT);
      });
    let calls = 0;
    await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "c" }, { session });
    });
    expect(calls).toBe(1);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(await coll.countDocuments({ ref: "c" })).toBe(1);
  });

  it("re-runs fn when the commit fails with TransientTransactionError", async () => {
    const coll = await probe();
    vi.spyOn(ClientSession.prototype, "commitTransaction").mockImplementationOnce(async () => {
      throw labelled(TRANSIENT);
    });
    let calls = 0;
    await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "d" }, { session });
    });
    expect(calls).toBe(2);
    expect(await coll.countDocuments({ ref: "d" })).toBe(1);
  });

  it("bounds commit retries on UnknownTransactionCommitResult by maxAttempts", async () => {
    const coll = await probe();
    const unknown = labelled(UNKNOWN_COMMIT);
    const commit = vi.spyOn(ClientSession.prototype, "commitTransaction").mockImplementation(async () => {
      throw unknown;
    });
    let calls = 0;
    const error: unknown = await withTransaction(
      async (session) => {
        calls += 1;
        await coll.insertOne({ ref: "e" }, { session });
      },
      { maxAttempts: 3 },
    ).catch((e: unknown) => e);
    expect(commit).toHaveBeenCalledTimes(3);
    expect(calls).toBe(1);
    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as DependencyUnavailableError).cause).toBe(unknown);
  });

  it("bounds fn re-runs when commit keeps failing with TransientTransactionError", async () => {
    const coll = await probe();
    vi.spyOn(ClientSession.prototype, "commitTransaction").mockImplementation(async () => {
      throw labelled(TRANSIENT);
    });
    let calls = 0;
    const outcome = withTransaction(
      async (session) => {
        calls += 1;
        await coll.insertOne({ ref: "f" }, { session });
      },
      { maxAttempts: 2 },
    );
    await expect(outcome).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(calls).toBe(2);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it("rethrows an unlabelled commit error unchanged without retrying", async () => {
    const coll = await probe();
    const unlabelled = new MongoError("commit failed");
    const commit = vi.spyOn(ClientSession.prototype, "commitTransaction").mockImplementationOnce(async () => {
      throw unlabelled;
    });
    let calls = 0;
    const outcome = withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "g" }, { session });
    });
    await expect(outcome).rejects.toBe(unlabelled);
    expect(calls).toBe(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it("rejects an invalid maxAttempts with RangeError before running fn", async () => {
    for (const maxAttempts of [0, 11, 1.5]) {
      let calls = 0;
      const outcome = withTransaction(
        async () => {
          calls += 1;
        },
        { maxAttempts },
      );
      await expect(outcome).rejects.toBeInstanceOf(RangeError);
      expect(calls).toBe(0);
    }
  });
});
