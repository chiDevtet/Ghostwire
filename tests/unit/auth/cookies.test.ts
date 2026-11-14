import { describe, expect, it } from "vitest";
import {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "@/modules/auth";

const HTTPS = "https://ghostwire.test";
const HTTP = "http://localhost:3000";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_-";
const OTHER = "Z".repeat(43);

function withCookie(cookie: string): Request {
  return new Request(`${HTTPS}/api/v1/me`, { headers: { cookie } });
}

describe("session cookie strings", () => {
  it("uses __Host-gw_session with Secure for an https origin", () => {
    expect(sessionCookieName(HTTPS)).toBe("__Host-gw_session");
    expect(buildSessionCookie(TOKEN, 604_800, HTTPS)).toBe(
      `__Host-gw_session=${TOKEN}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(clearSessionCookie(HTTPS)).toBe(
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("uses gw_session without Secure for an http origin", () => {
    expect(sessionCookieName(HTTP)).toBe("gw_session");
    expect(buildSessionCookie(TOKEN, 60, HTTP)).toBe(
      `gw_session=${TOKEN}; Path=/; Max-Age=60; HttpOnly; SameSite=Lax`,
    );
    expect(clearSessionCookie(HTTP)).toBe("gw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });
});

describe("readSessionToken", () => {
  it("reads the configured cookie among others", () => {
    expect(readSessionToken(withCookie(`a=1; __Host-gw_session=${TOKEN}; b=2`), HTTPS)).toBe(TOKEN);
  });

  it("ignores the other name for the configured origin", () => {
    expect(readSessionToken(withCookie(`gw_session=${TOKEN}`), HTTPS)).toBeNull();
    expect(readSessionToken(withCookie(`__Host-gw_session=${TOKEN}`), HTTP)).toBeNull();
    expect(readSessionToken(withCookie(`gw_session=${TOKEN}`), HTTP)).toBe(TOKEN);
  });

  it.each([
    "__Host-gw_session=short",
    `__Host-gw_session=${TOKEN}x`,
    `__Host-gw_session=${TOKEN.slice(0, 42)}!`,
    "__Host-gw_session=",
    "__Host-gw_session",
  ])("ignores a malformed value: %s", (cookie) => {
    expect(readSessionToken(withCookie(cookie), HTTPS)).toBeNull();
  });

  it("takes the first well-formed duplicate", () => {
    const cookie = `__Host-gw_session=bad; __Host-gw_session=${TOKEN}; __Host-gw_session=${OTHER}`;
    expect(readSessionToken(withCookie(cookie), HTTPS)).toBe(TOKEN);
  });

  it("returns null without a Cookie header", () => {
    expect(readSessionToken(new Request(`${HTTPS}/x`), HTTPS)).toBeNull();
  });
});

describe("parseSessionTokenValue", () => {
  it("returns a well-formed token unchanged", () => {
    expect(parseSessionTokenValue(TOKEN)).toBe(TOKEN);
  });

  it.each([undefined, "", "short", `${TOKEN}x`, `${TOKEN.slice(0, 42)}!`])(
    "returns null for %s",
    (value) => {
      expect(parseSessionTokenValue(value)).toBeNull();
    },
  );
});

describe("carriesSessionCookie", () => {
  it.each([
    `__Host-gw_session=${TOKEN}`,
    "gw_session=anything",
    "a=1; __Host-gw_session=malformed; b=2",
    "gw_session=x",
  ])("is true for %s", (cookie) => {
    expect(carriesSessionCookie(withCookie(cookie))).toBe(true);
  });

  it.each(["__Host-gw_session=", "gw_session=", "a=1; b=2", "gw_session", "x_gw_session=abc"])(
    "is false for %s",
    (cookie) => {
      expect(carriesSessionCookie(withCookie(cookie))).toBe(false);
    },
  );

  it("is false without a Cookie header", () => {
    expect(carriesSessionCookie(new Request(`${HTTPS}/x`))).toBe(false);
  });
});
