import { afterEach, describe, expect, inject, it } from "vitest";
import { loadConfig } from "@/modules/config";
import { closeDb, getDb, ping } from "@/modules/database";
import { ConfigError, DependencyUnavailableError } from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("getDb", () => {
  it("returns the configured database", async () => {
    expect((await getDb()).databaseName).toBe(loadConfig().MONGODB_DB_NAME);
  });

  it("shares one client across concurrent callers", async () => {
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(a.client).toBe(b.client);
  });

  it("rejects with DependencyUnavailableError when no server is reachable", async () => {
    await useDatabaseUri("mongodb://127.0.0.1:1/?directConnection=true");
    await expect(getDb()).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it("maps a URI the driver cannot parse to ConfigError on MONGODB_URI", async () => {
    await useDatabaseUri("mongodb://127.0.0.1:notaport/");
    const error: unknown = await getDb().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues.map((i) => i.key)).toEqual(["MONGODB_URI"]);
  });
});

describe("ping", () => {
  it("resolves against the running replica set", async () => {
    await expect(ping()).resolves.toBeUndefined();
  });

  it("rejects out-of-range timeouts with RangeError", async () => {
    await expect(ping(0)).rejects.toBeInstanceOf(RangeError);
    await expect(ping(30_001)).rejects.toBeInstanceOf(RangeError);
    await expect(ping(Number.NaN)).rejects.toBeInstanceOf(RangeError);
  });

  it("throws DependencyUnavailableError within the timeout once the server stops", async () => {
    const standalone = await startStandalone();
    let stopped = false;
    try {
      await useDatabaseUri(standalone.getUri());
      await expect(ping()).resolves.toBeUndefined();
      await standalone.stop({ doCleanup: true });
      stopped = true;
      const started = performance.now();
      await expect(ping(500)).rejects.toBeInstanceOf(DependencyUnavailableError);
      expect(performance.now() - started).toBeLessThan(1500);
    } finally {
      if (!stopped) await standalone.stop({ doCleanup: true });
    }
  });

  it("propagates ConfigError unchanged", async () => {
    await useDatabaseUri("not-a-mongodb-uri");
    await expect(ping()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("closeDb", () => {
  it("is idempotent and the next getDb reconnects", async () => {
    await getDb();
    await closeDb();
    await closeDb();
    await expect(ping()).resolves.toBeUndefined();
  });
});
