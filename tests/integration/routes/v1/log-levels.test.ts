import { afterEach, describe, expect, inject, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as meRoute from "@/app/api/v1/me/route";
import { signIn, verify } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { captureLogLines, type CapturedLogs } from "../../../helpers/logs";
import { startStandalone, useDatabaseUri } from "../../../helpers/mongo";

interface LogLine {
  readonly level: string;
  readonly msg: string;
  readonly [key: string]: unknown;
}

let capture: CapturedLogs | null = null;

afterEach(async () => {
  capture?.restore();
  capture = null;
  await useDatabaseUri(inject("mongoUri"));
});

function parsed(logs: CapturedLogs): LogLine[] {
  return logs.lines().map((line) => JSON.parse(line) as LogLine);
}

/** Lines written by toErrorResponse (the only writer of these two messages). */
function responseLines(logs: CapturedLogs): LogLine[] {
  return parsed(logs).filter((l) => l.msg === "request rejected" || l.msg === "request failed");
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

function postChallenge(client: TestClient, body: unknown, origin?: string) {
  return client.call(challengeRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/challenge",
    body,
    ...(origin === undefined ? {} : { origin }),
  });
}

describe("toErrorResponse log levels through the routes (spec §7.1)", () => {
  it("logs a 401 UNAUTHENTICATED at debug with { code, status } and no error line", async () => {
    capture = captureLogLines();
    const result = await new TestClient().call(meRoute.GET, { method: "GET", path: "/api/v1/me" });
    expect(result.status).toBe(401);
    const lines = responseLines(capture);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "debug",
      msg: "request rejected",
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(lines.some((l) => l.level === "error")).toBe(false);
  });

  it("logs a 403 ORIGIN_REJECTED at warn with no err or stack", async () => {
    capture = captureLogLines();
    const body = { address: createTestWallet().address, network: "devnet" };
    const result = await postChallenge(new TestClient(), body, "https://evil.test");
    expect(result.status).toBe(403);
    const [line, ...rest] = responseLines(capture);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ level: "warn", code: "ORIGIN_REJECTED", status: 403 });
    expect(line).not.toHaveProperty("err");
    expect(JSON.stringify(line)).not.toContain("stack");
  });

  it("logs a 400 VALIDATION_FAILED at warn", async () => {
    capture = captureLogLines();
    const result = await postChallenge(new TestClient(), { address: "0OIl", network: "devnet" });
    expect(result.status).toBe(400);
    const [line] = responseLines(capture);
    expect(line).toMatchObject({ level: "warn", code: "VALIDATION_FAILED", status: 400 });
    expect(line).not.toHaveProperty("err");
  });

  it("logs a replayed challenge (401 AUTH_FAILED) at warn, not debug", async () => {
    const signedIn = await signIn(new TestClient(), createTestWallet());
    capture = captureLogLines();
    const replay = await verify(new TestClient(), signedIn.challenge, signedIn.signature);
    expect(replay.status).toBe(401);
    const lines = responseLines(capture);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", code: "AUTH_FAILED", status: 401 });
    expect(lines[0]).not.toHaveProperty("err");
  });

  it("logs a 503 (database down) at error with the err object", async () => {
    await useDatabaseUri(await stoppedUri());
    capture = captureLogLines();
    const body = { address: createTestWallet().address, network: "devnet" };
    const result = await postChallenge(new TestClient(), body);
    expect(result.status).toBe(503);
    const errorLines = responseLines(capture).filter((l) => l.level === "error");
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toMatchObject({ msg: "request failed", code: "DEPENDENCY_UNAVAILABLE" });
    expect(errorLines[0]).toHaveProperty("err");
  });
});
