import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  createLogger,
  logger,
  redact,
  setLogLevel,
  type LogLevel,
  type LogSink,
} from "@/modules/shared";

function memorySink(): LogSink & { readonly lines: { level: LogLevel; line: string }[] } {
  const lines: { level: LogLevel; line: string }[] = [];
  return {
    lines,
    write(level, line) {
      lines.push({ level, line });
    },
  };
}

const FIXED = new Date("2026-11-12T10:00:00.000Z");

function parsed(sink: ReturnType<typeof memorySink>): Record<string, unknown>[] {
  return sink.lines.map((l) => JSON.parse(l.line) as Record<string, unknown>);
}

describe("redact", () => {
  it("redacts sensitive keys case-insensitively, in nested objects and arrays", () => {
    const out = redact({
      user: { name: "ana", ViewingKey: "vk-1", apiKey: "ak-1", PASSWORD: "pw" },
      headers: { Authorization: "Bearer abc", Cookie: "sid=1" },
      wallets: [{ seedPhrase: "words", label: "main" }, { privateKey: "pk" }],
      signature: "sig",
      mnemonic: "m",
      clientSecret: "s",
      refreshToken: "t",
    });
    expect(out).toEqual({
      user: { name: "ana", ViewingKey: REDACTED, apiKey: REDACTED, PASSWORD: REDACTED },
      headers: { Authorization: REDACTED, Cookie: REDACTED },
      wallets: [{ seedPhrase: REDACTED, label: "main" }, { privateKey: REDACTED }],
      signature: REDACTED,
      mnemonic: REDACTED,
      clientSecret: REDACTED,
      refreshToken: REDACTED,
    });
  });

  it("redacts a whole object under a sensitive key", () => {
    expect(redact({ keys: { a: 1 } })).toEqual({ keys: REDACTED });
  });

  it("over-redacts keys such as idempotencyKey (intentional safe failure)", () => {
    expect(redact({ idempotencyKey: "k-1" })).toEqual({ idempotencyKey: REDACTED });
  });

  it("scrubs credentials embedded in URI strings", () => {
    expect(redact({ uri: "mongodb://alice:s3cr3t@db.example.com:27017/app" })).toEqual({
      uri: "mongodb://[REDACTED]@db.example.com:27017/app",
    });
    expect(redact("see https://example.com/a@b")).toBe("see https://example.com/a@b");
  });

  it("scrubs through the last @ in a token when the password contains an unencoded @", () => {
    expect(redact("mongodb://u:p@ss@h/x")).toBe("mongodb://[REDACTED]@h/x");
  });

  it("scrubs through the last @ in a token when the password contains an unencoded /", () => {
    expect(redact("mongodb://u:pa/ss@h/x")).toBe("mongodb://[REDACTED]@h/x");
  });

  it("keeps the SRV scheme, host, path and query after scrubbing", () => {
    expect(redact("mongodb+srv://user:pw@cluster.example.net/db?x=1")).toBe(
      "mongodb+srv://[REDACTED]@cluster.example.net/db?x=1",
    );
  });

  it("scrubs two URIs in one string independently", () => {
    expect(redact("a mongodb://u1:p1@h1/x and mongodb://u2:p2@h2/y end")).toBe(
      "a mongodb://[REDACTED]@h1/x and mongodb://[REDACTED]@h2/y end",
    );
  });

  it("leaves a URI with no userinfo unchanged", () => {
    expect(redact("https://example.com/a")).toBe("https://example.com/a");
  });

  it("walks Map and Set", () => {
    const out = redact({
      m: new Map<string, string>([
        ["apiKey", "x"],
        ["safe", "y"],
      ]),
      s: new Set(["a", "b"]),
    });
    expect(out).toEqual({ m: { apiKey: REDACTED, safe: "y" }, s: ["a", "b"] });
  });

  it("serializes errors with their cause and scrubs their messages", () => {
    const inner = new Error("inner");
    const outer = new Error("connect failed mongodb://bob:pw@h:1", { cause: inner });
    const out = redact({ err: outer }) as { err: Record<string, unknown> };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("connect failed mongodb://[REDACTED]@h:1");
    expect(typeof out.err.stack).toBe("string");
    expect(String(out.err.stack)).not.toContain("bob:pw");
    expect(out.err.cause).toMatchObject({ name: "Error", message: "inner" });
  });

  it("converts bigint to a decimal string", () => {
    expect(redact({ amount: 18446744073709551616n })).toEqual({ amount: "18446744073709551616" });
  });

  it("marks cycles but not shared non-cyclic references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(redact(a)).toEqual({ name: "a", self: "[Circular]" });
    const shared = { v: 1 };
    expect(redact({ x: shared, y: shared })).toEqual({ x: { v: 1 }, y: { v: 1 } });
  });

  it("truncates values nested deeper than 8 levels", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 12; i += 1) deep = { a: deep };
    let cursor = redact(deep) as Record<string, unknown>;
    for (let i = 0; i < 8; i += 1) cursor = cursor.a as Record<string, unknown>;
    expect(typeof cursor).toBe("object");
    expect(cursor.a).toBe("[Truncated]");
  });
});

describe("createLogger", () => {
  it("writes one JSON line with ts, level, msg and redacted fields", () => {
    const sink = memorySink();
    const log = createLogger({ level: "debug", sink, now: () => FIXED });
    log.info("hello mongodb://u:p@h", { requestId: "r-1", apiKey: "secret-value" });
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]?.level).toBe("info");
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "info",
      msg: "hello mongodb://[REDACTED]@h",
      requestId: "r-1",
      apiKey: REDACTED,
    });
    expect(sink.lines[0]?.line).not.toContain("secret-value");
  });

  it("lets reserved keys win over same-named fields", () => {
    const sink = memorySink();
    createLogger({ level: "debug", sink, now: () => FIXED }).warn("real", {
      ts: "spoof",
      level: "spoof",
      msg: "spoof",
      extra: 1,
    });
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "warn",
      msg: "real",
      extra: 1,
    });
  });

  it("drops lines below the configured level", () => {
    const sink = memorySink();
    const log = createLogger({ level: "warn", sink, now: () => FIXED });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(parsed(sink).map((l) => l.msg)).toEqual(["w", "e"]);
  });

  it("re-reads a level getter on every call", () => {
    const sink = memorySink();
    let level: LogLevel = "error";
    const log = createLogger({ level: () => level, sink, now: () => FIXED });
    log.info("dropped");
    level = "debug";
    log.info("kept");
    expect(parsed(sink).map((l) => l.msg)).toEqual(["kept"]);
  });

  it("writes a fallback line when serialization fails", () => {
    const sink = memorySink();
    const log = createLogger({ level: "debug", sink, now: () => FIXED });
    log.error("bad", {
      bad: {
        toJSON() {
          throw new Error("nope");
        },
      },
    });
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "error",
      msg: "bad",
      logError: "serialization_failed",
    });
  });

  it("never throws, even when the sink throws", () => {
    const log = createLogger({
      level: "debug",
      sink: {
        write() {
          throw new Error("disk full");
        },
      },
    });
    expect(() => log.error("x")).not.toThrow();
  });
});

describe("logger singleton", () => {
  afterEach(() => {
    setLogLevel("info");
  });

  it("honours setLogLevel and routes warn/error to stderr", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const errOut = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("error");
    logger.info("dropped");
    logger.error("kept");
    expect(out).not.toHaveBeenCalled();
    expect(errOut).toHaveBeenCalledTimes(1);
    const line = String(errOut.mock.calls[0]?.[0]);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toMatchObject({ level: "error", msg: "kept" });
  });
});
