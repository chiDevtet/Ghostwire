import { describe, expect, it } from "vitest";
import { REDACTED, redact } from "@/modules/shared";

describe("redact: PR 02 sensitive key names (entry gate 1)", () => {
  it.each([
    "passwd",
    "dbPwd",
    "passphrase",
    "credentials",
    "bearerValue",
    "jwt",
    "sessionToken",
    "sessionId",
    "csrf",
    "nonce",
    "nonceHash",
  ])("redacts the value under %s", (key) => {
    expect(redact({ [key]: "SENTINEL-VALUE" })).toEqual({ [key]: REDACTED });
  });

  it("matches the new key parts case-insensitively", () => {
    expect(redact({ PassPhrase: "x", JWT: "y", CSRF_HEADER: "z" })).toEqual({
      PassPhrase: REDACTED,
      JWT: REDACTED,
      CSRF_HEADER: REDACTED,
    });
  });

  it("does not redact author (auth is deliberately not a key part)", () => {
    expect(redact({ author: "ana", authorName: "Ana B" })).toEqual({
      author: "ana",
      authorName: "Ana B",
    });
  });

  it("keeps the opaque id field names used by auth logs", () => {
    expect(redact({ uid: "u1", wid: "w1", sid: "s1", cid: "c1", reason: "r" })).toEqual({
      uid: "u1",
      wid: "w1",
      sid: "s1",
      cid: "c1",
      reason: "r",
    });
  });
});

describe("redact: Authorization-style values in free text (entry gate 2)", () => {
  it.each([
    ["Authorization: Bearer abc.def-ghi_jkl", "Authorization: Bearer [REDACTED]"],
    ["authorization: bearer abc", "authorization: bearer [REDACTED]"],
    ["BEARER xyz end", "BEARER [REDACTED] end"],
    ["Basic dXNlcjpwYXNz", "Basic [REDACTED]"],
    ["header basic dXNlcjpwYXNz; next", "header basic [REDACTED]; next"],
    ['{"h":"Bearer tok"}', '{"h":"Bearer [REDACTED]"}'],
  ])("scrubs %j", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe("redact: credential parameters in free text (entry gate 2)", () => {
  const NAMES = [
    "token",
    "access_token",
    "api-key",
    "api_key",
    "apikey",
    "secret",
    "password",
    "session",
    "nonce",
    "signature",
  ] as const;

  it.each(NAMES)("scrubs %s= terminated by &", (name) => {
    expect(redact(`https://h.example/cb?${name}=SENTINEL&x=1`)).toBe(
      `https://h.example/cb?${name}=[REDACTED]&x=1`,
    );
  });

  it.each(NAMES)("scrubs %s= terminated by whitespace", (name) => {
    expect(redact(`${name}=SENTINEL next`)).toBe(`${name}=[REDACTED] next`);
  });

  it.each(NAMES)("scrubs %s= terminated by a double quote", (name) => {
    expect(redact(`"${name}=SENTINEL"`)).toBe(`"${name}=[REDACTED]"`);
  });

  it.each(NAMES)("scrubs %s= terminated by a single quote", (name) => {
    expect(redact(`'${name}=SENTINEL'`)).toBe(`'${name}=[REDACTED]'`);
  });

  it.each(NAMES)("scrubs %s= at the end of the string", (name) => {
    expect(redact(`${name}=SENTINEL`)).toBe(`${name}=[REDACTED]`);
  });

  it("matches parameter names case-insensitively and keeps the original spelling", () => {
    expect(redact("API_KEY=abc&Nonce=def")).toBe("API_KEY=[REDACTED]&Nonce=[REDACTED]");
  });

  it("leaves other parameters alone", () => {
    expect(redact("page=2&sort=asc")).toBe("page=2&sort=asc");
  });

  it("still scrubs URI userinfo, and combines with parameter scrubbing", () => {
    expect(redact("mongodb://u:p@h/db?password=x")).toBe(
      "mongodb://[REDACTED]@h/db?password=[REDACTED]",
    );
  });

  it("scrubs error messages and stacks too", () => {
    const out = redact({ err: new Error("callback failed token=SENTINEL") }) as {
      err: { message: string; stack: string };
    };
    expect(out.err.message).toBe("callback failed token=[REDACTED]");
    expect(out.err.stack).not.toContain("SENTINEL");
  });
});
