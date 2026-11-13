import { afterEach, describe, expect, inject, it, vi } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as verifyRoute from "@/app/api/v1/auth/verify/route";
import * as meRoute from "@/app/api/v1/me/route";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { logger } from "@/modules/shared";
import { requestChallenge, signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { startStandalone, useDatabaseUri } from "../../../helpers/mongo";

const VALIDATION_FAILED = { code: "VALIDATION_FAILED", message: "Invalid request" };

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

function postChallenge(client: TestClient, options: { body?: unknown; rawBody?: string }) {
  return client.call(challengeRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/challenge",
    ...options,
  });
}

function postVerify(client: TestClient, body: unknown) {
  return client.call(verifyRoute.POST, { method: "POST", path: "/api/v1/auth/verify", body });
}

describe("400 VALIDATION_FAILED", () => {
  describe("body size cap", () => {
    // A schema-valid challenge body padded with JSON whitespace: only its size can reject it.
    function padded(bytes: number): string {
      const core = JSON.stringify({ address: createTestWallet().address, network: "devnet" });
      return core + " ".repeat(bytes - Buffer.byteLength(core));
    }

    it("accepts a valid body of exactly 4096 bytes (control)", async () => {
      const rawBody = padded(4096);
      expect(Buffer.byteLength(rawBody)).toBe(4096);
      const result = await postChallenge(new TestClient(), { rawBody });
      expect(result.status).toBe(200);
    });

    it("rejects the same valid body at 4097 bytes", async () => {
      const rawBody = padded(4097);
      expect(Buffer.byteLength(rawBody)).toBe(4097);
      const result = await postChallenge(new TestClient(), { rawBody });
      expect(result.status).toBe(400);
      expect(result.json).toEqual(VALIDATION_FAILED);
    });
  });

  it.each([
    { label: "a non-JSON body", rawBody: "{not json" },
    { label: "an empty body", rawBody: "" },
  ])("rejects $label", async ({ rawBody }) => {
    const result = await postChallenge(new TestClient(), { rawBody });
    expect(result.status).toBe(400);
    expect(result.json).toEqual(VALIDATION_FAILED);
  });

  it.each([
    {
      label: "an unknown key",
      body: { address: createTestWallet().address, network: "devnet", x: 1 },
    },
    { label: "a malformed address", body: { address: "0OIl", network: "devnet" } },
    { label: "a non-string network", body: { address: createTestWallet().address, network: 1 } },
    { label: "an array body", body: [] },
  ])("rejects a challenge with $label", async ({ body }) => {
    const result = await postChallenge(new TestClient(), { body });
    expect(result.status).toBe(400);
    expect(result.json).toEqual(VALIDATION_FAILED);
  });

  it("rejects verify bodies with a malformed signature, provider or challengeId", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const challenge = await requestChallenge(client, wallet);
    const signature = wallet.sign(challenge.message);
    for (const body of [
      { challengeId: challenge.challengeId, signature: "0OIl" },
      { challengeId: challenge.challengeId, signature: signature.slice(0, 40) },
      { challengeId: challenge.challengeId, signature, provider: "Bad!" },
      { challengeId: challenge.challengeId, signature, provider: "x".repeat(33) },
      { challengeId: "not-an-object-id", signature },
      { challengeId: challenge.challengeId },
    ]) {
      const result = await postVerify(client, body);
      expect(result.status).toBe(400);
      expect(result.json).toEqual(VALIDATION_FAILED);
    }
    expect(
      (await postVerify(client, { challengeId: challenge.challengeId, signature })).status,
    ).toBe(200);
  });
});

describe("503 DEPENDENCY_UNAVAILABLE", () => {
  it("returns 503 with Retry-After: 5 when the database is down", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    await useDatabaseUri(await stoppedUri());
    const result = await postChallenge(new TestClient(), {
      body: { address: createTestWallet().address, network: "devnet" },
    });
    expect(result.status).toBe(503);
    expect(result.headers.get("retry-after")).toBe("5");
    expect(result.json).toEqual({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
    });
  });
});

describe("500 INTERNAL", () => {
  it("collapses a DATA_INTEGRITY failure to INTERNAL and logs the original code", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    await (
      await getDb()
    )
      .collection("sessions")
      .updateOne({ tokenHash: sha256Hex(client.cookie ?? "") }, { $set: { userAgent: 5 } });
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const result = await client.call(meRoute.GET, { method: "GET", path: "/api/v1/me" });
    expect(result.status).toBe(500);
    expect(result.json).toEqual({ code: "INTERNAL", message: "Internal error" });
    expect(error).toHaveBeenCalledWith(
      "request failed",
      expect.objectContaining({ code: "DATA_INTEGRITY" }),
    );
  });
});
