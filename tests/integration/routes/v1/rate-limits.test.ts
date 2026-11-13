import { afterEach, describe, expect, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as verifyRoute from "@/app/api/v1/auth/verify/route";
import * as linkChallengeRoute from "@/app/api/v1/wallets/link/challenge/route";
import { signIn } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { useEnv } from "../../../helpers/env";
import { TestClient } from "../../../helpers/http";

const RATE_LIMITED = { code: "RATE_LIMITED", message: "Too many requests" };

let restoreEnv: (() => void) | undefined;

afterEach(() => {
  restoreEnv?.();
  restoreEnv = undefined;
});

function challenge(client: TestClient, address: string, headers?: Record<string, string>) {
  return client.call(challengeRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/challenge",
    body: { address, network: "devnet" },
    headers,
  });
}

describe("rate limits", () => {
  it("returns 429 with Retry-After on the (limit+1)th challenge per IP per minute", async () => {
    useTestClock(new Date("2026-11-13T10:00:15.000Z"));
    restoreEnv = useEnv({ RATE_LIMIT_CHALLENGE_PER_MIN: "3" });
    const client = new TestClient();
    for (let i = 0; i < 3; i += 1) {
      expect((await challenge(client, createTestWallet().address)).status).toBe(200);
    }
    const limited = await challenge(client, createTestWallet().address);
    expect(limited.status).toBe(429);
    expect(limited.json).toEqual(RATE_LIMITED);
    expect(limited.headers.get("retry-after")).toBe("45");
    expect(limited.headers.get("cache-control")).toBe("no-store");
  });

  it("counts malformed requests against the IP limit", async () => {
    useTestClock(new Date("2026-11-13T11:00:00.000Z"));
    restoreEnv = useEnv({ RATE_LIMIT_CHALLENGE_PER_MIN: "2" });
    const client = new TestClient();
    expect((await challenge(client, "bad")).status).toBe(400);
    expect((await challenge(client, "bad")).status).toBe(400);
    expect((await challenge(client, createTestWallet().address)).status).toBe(429);
  });

  it("limits challenges per address per hour", async () => {
    const clock = useTestClock(new Date("2026-11-13T12:00:00.000Z"));
    restoreEnv = useEnv({ RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: "2" });
    const address = createTestWallet().address;
    const client = new TestClient();
    expect((await challenge(client, address)).status).toBe(200);
    clock.advance(61_000);
    expect((await challenge(client, address)).status).toBe(200);
    clock.advance(61_000);
    const limited = await challenge(client, address);
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(60);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect((await challenge(client, createTestWallet().address)).status).toBe(200);
  });

  it("limits verify per IP per minute", async () => {
    useTestClock(new Date("2026-11-13T13:00:00.000Z"));
    restoreEnv = useEnv({ RATE_LIMIT_VERIFY_PER_MIN: "2" });
    const client = new TestClient();
    const body = { challengeId: "0123456789abcdef01234567", signature: "x" };
    for (let i = 0; i < 2; i += 1) {
      const result = await client.call(verifyRoute.POST, {
        method: "POST",
        path: "/api/v1/auth/verify",
        body,
      });
      expect(result.status).toBe(400);
    }
    const limited = await client.call(verifyRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/verify",
      body,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });

  it("applies the same per-minute limit to the link challenge route under its own key", async () => {
    useTestClock(new Date("2026-11-13T14:00:00.000Z"));
    const client = new TestClient();
    await signIn(client, createTestWallet());
    restoreEnv = useEnv({ RATE_LIMIT_CHALLENGE_PER_MIN: "1" });
    const link = () =>
      client.call(linkChallengeRoute.POST, {
        method: "POST",
        path: "/api/v1/wallets/link/challenge",
        body: { address: createTestWallet().address, network: "devnet" },
      });
    expect((await link()).status).toBe(200);
    expect((await link()).status).toBe(429);
  });

  it("keeps separate buckets per X-Forwarded-For client when TRUST_PROXY=true", async () => {
    useTestClock(new Date("2026-11-13T15:00:00.000Z"));
    restoreEnv = useEnv({ RATE_LIMIT_CHALLENGE_PER_MIN: "1", TRUST_PROXY: "true" });
    const client = new TestClient();
    const a = { "x-forwarded-for": "203.0.113.1" };
    const b = { "x-forwarded-for": "203.0.113.2" };
    expect((await challenge(client, createTestWallet().address, a)).status).toBe(200);
    expect((await challenge(client, createTestWallet().address, b)).status).toBe(200);
    expect((await challenge(client, createTestWallet().address, a)).status).toBe(429);
  });
});
