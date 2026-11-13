import { afterEach, describe, expect, inject, it } from "vitest";
import * as health from "@/app/api/health/route";
import { useDatabaseUri } from "../../helpers/mongo";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("GET /api/health", () => {
  it("returns 200 {status: ok} with no-store", async () => {
    const res = health.GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("still returns 200 when the database configuration is broken", async () => {
    await useDatabaseUri("not-a-mongodb-uri");
    const res = health.GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("runs on the Node runtime and is always dynamic", () => {
    expect(health.runtime).toBe("nodejs");
    expect(health.dynamic).toBe("force-dynamic");
  });
});
