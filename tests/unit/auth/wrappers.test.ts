import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withOrigin, withSession, type RouteHandler } from "@/modules/auth";
import { ValidationError, logger } from "@/modules/shared";
import { useEnv } from "../../helpers/env";

/** Port 1: nothing listens there. No test here reaches the database. */
const UNIT_ENV = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:1/?replicaSet=rs0",
  MONGODB_DB_NAME: "wrappers_unit",
  APP_ORIGIN: "https://ghostwire.test",
};

let restore: () => void;

beforeEach(() => {
  restore = useEnv(UNIT_ENV);
  vi.spyOn(logger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  restore();
});

const CONTEXT = { params: Promise.resolve({}) };

function post(origin?: string): Request {
  const headers = origin === undefined ? undefined : { origin };
  return new Request("https://ghostwire.test/api/v1/x", { method: "POST", headers });
}

describe("withOrigin", () => {
  it("returns 403 ORIGIN_REJECTED without calling the handler for a foreign or missing Origin", async () => {
    const handler = vi.fn<RouteHandler>(async () => new Response(null, { status: 204 }));
    const wrapped = withOrigin(handler);
    for (const request of [post("https://evil.test"), post()]) {
      const response = await wrapped(request, CONTEXT);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        code: "ORIGIN_REJECTED",
        message: "Origin not allowed",
      });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler for a matching Origin and passes its response through", async () => {
    const wrapped = withOrigin(async () => new Response("ok", { status: 201 }));
    const response = await wrapped(post("https://ghostwire.test"), CONTEXT);
    expect(response.status).toBe(201);
  });

  it("maps a thrown ValidationError to a 400 body", async () => {
    const wrapped = withOrigin(async () => {
      throw new ValidationError({ message: "SENTINEL detail" });
    });
    const response = await wrapped(post("https://ghostwire.test"), CONTEXT);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"code":"VALIDATION_FAILED","message":"Invalid request"}');
  });

  it("maps a thrown plain Error to 500 INTERNAL", async () => {
    const wrapped = withOrigin(async () => {
      throw new Error("SENTINEL boom");
    });
    const response = await wrapped(post("https://ghostwire.test"), CONTEXT);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL", message: "Internal error" });
  });

  it("returns a 500 instead of throwing when config is invalid at request time", async () => {
    restore();
    restore = useEnv({ ...UNIT_ENV, APP_ORIGIN: undefined });
    const response = await withOrigin(async () => new Response())(post("x"), CONTEXT);
    expect(response.status).toBe(500);
  });
});

describe("withSession", () => {
  it("returns 401 UNAUTHENTICATED without a session cookie and never calls the handler", async () => {
    const handler = vi.fn(async () => new Response());
    const response = await withSession(handler)(
      new Request("https://ghostwire.test/api/v1/me"),
      CONTEXT,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 for a malformed cookie without touching the database", async () => {
    const request = new Request("https://ghostwire.test/api/v1/me", {
      headers: { cookie: "__Host-gw_session=not-a-token" },
    });
    const response = await withSession(async () => new Response())(request, CONTEXT);
    expect(response.status).toBe(401);
  });
});
