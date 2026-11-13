import { afterEach, describe, expect, it } from "vitest";
import type { RouteHandler } from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { ConfigError, now, resetClockForTests } from "@/modules/shared";
import { useTestClock } from "../../helpers/clock";
import { useEnv } from "../../helpers/env";
import { TestClient } from "../../helpers/http";

const TOKEN = "A".repeat(43);

/** Echoes what it received and sets whatever cookie the test asks for. */
const echo: RouteHandler<{ id: string }> = async (request, context) => {
  const { id } = await context.params;
  const setCookie = request.headers.get("x-set-cookie");
  const headers = new Headers({ "content-type": "application/json" });
  if (setCookie !== null) headers.append("Set-Cookie", setCookie);
  return new Response(
    JSON.stringify({
      method: request.method,
      url: request.url,
      origin: request.headers.get("origin"),
      cookie: request.headers.get("cookie"),
      body: request.body === null ? null : await request.text(),
      id: id ?? null,
    }),
    { status: 200, headers },
  );
};

afterEach(() => {
  resetClockForTests();
});

describe("TestClient", () => {
  it("sends Origin on non-GET only, by default", async () => {
    const client = new TestClient();
    const post = await client.call(echo, { method: "POST", path: "/api/v1/x" });
    const get = await client.call(echo, { method: "GET", path: "/api/v1/x" });
    expect(post.json).toMatchObject({ origin: "https://ghostwire.test", method: "POST" });
    expect(get.json).toMatchObject({ origin: null, url: "https://ghostwire.test/api/v1/x" });
  });

  it("omits Origin for null and overrides it with a string", async () => {
    const client = new TestClient();
    const none = await client.call(echo, { method: "POST", path: "/x", origin: null });
    const evil = await client.call(echo, { method: "POST", path: "/x", origin: "https://e.test" });
    expect(none.json).toMatchObject({ origin: null });
    expect(evil.json).toMatchObject({ origin: "https://e.test" });
  });

  it("serializes body as JSON, sends rawBody as-is, and passes params", async () => {
    const client = new TestClient();
    const json = await client.call(echo, { method: "POST", path: "/x", body: { a: 1 } });
    const raw = await client.call(echo, { method: "POST", path: "/x", rawBody: "{bad" });
    const withId = await client.call(echo, { method: "DELETE", path: "/x/1", params: { id: "1" } });
    expect(json.json).toMatchObject({ body: '{"a":1}' });
    expect(raw.json).toMatchObject({ body: "{bad" });
    expect(withId.json).toMatchObject({ id: "1" });
  });

  it("stores the session cookie from Set-Cookie, sends it back, and clears it on Max-Age=0", async () => {
    const client = new TestClient();
    await client.call(echo, {
      method: "POST",
      path: "/x",
      headers: { "x-set-cookie": `__Host-gw_session=${TOKEN}; Path=/; Max-Age=60; HttpOnly` },
    });
    expect(client.cookie).toBe(TOKEN);
    const next = await client.call(echo, { method: "GET", path: "/x" });
    expect(next.json).toMatchObject({ cookie: `__Host-gw_session=${TOKEN}` });
    await client.call(echo, {
      method: "POST",
      path: "/x",
      headers: { "x-set-cookie": "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly" },
    });
    expect(client.cookie).toBeNull();
  });

  it("uses gw_session for an http origin and ignores unrelated cookies", async () => {
    const client = new TestClient({ appOrigin: "http://localhost:3000" });
    client.setCookie(TOKEN);
    const result = await client.call(echo, {
      method: "GET",
      path: "/x",
      headers: { "x-set-cookie": "other=1; Path=/" },
    });
    expect(result.json).toMatchObject({ cookie: `gw_session=${TOKEN}` });
    expect(client.cookie).toBe(TOKEN);
  });
});

describe("useTestClock and useEnv", () => {
  it("drives now() and restores env values", () => {
    const clock = useTestClock(new Date("2026-11-13T10:00:00.000Z"));
    clock.advance(1500);
    expect(now().toISOString()).toBe("2026-11-13T10:00:01.500Z");
    clock.set(new Date("2027-01-01T00:00:00.000Z"));
    expect(now().toISOString()).toBe("2027-01-01T00:00:00.000Z");

    const restore = useEnv({
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:1/?replicaSet=rs0",
      MONGODB_DB_NAME: "helpers_test",
      APP_ORIGIN: "https://ghostwire.test",
      SESSION_IDLE_DAYS: "3",
      GW_HELPER_PROBE: undefined,
    });
    expect(loadConfig().SESSION_IDLE_DAYS).toBe(3);
    restore();
    // The unit project has no MONGODB_URI, so after restore the config is invalid again.
    expect(() => loadConfig()).toThrow(ConfigError);
  });
});
