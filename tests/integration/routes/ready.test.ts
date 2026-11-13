import { afterEach, describe, expect, inject, it, vi } from "vitest";
import * as ready from "@/app/api/ready/route";
import { logger } from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const DOWN_BODY = { status: "unavailable", checks: { database: "down" } };

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("GET /api/ready", () => {
  it("returns 200 ready when the database is up", async () => {
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ready", checks: { database: "up" } });
  });

  it("returns the fixed 503 body when the database is down and logs the cause server-side only", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await useDatabaseUri(await stoppedUri());
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual(DOWN_BODY);
    expect(text).not.toMatch(/Mongo|timed out|127\.0\.0\.1/);
    expect(warn).toHaveBeenCalledWith(
      "readiness check failed",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("returns the same fixed 503 body when configuration is invalid", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await useDatabaseUri("not-a-mongodb-uri");
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(DOWN_BODY);
  });

  it("runs on the Node runtime and is always dynamic", () => {
    expect(ready.runtime).toBe("nodejs");
    expect(ready.dynamic).toBe("force-dynamic");
  });
});
