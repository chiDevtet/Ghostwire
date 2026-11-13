import { describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import { getDb } from "@/modules/database";
import { parseSignInMessage } from "@/modules/wallet";
import { linkWallet, signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";

const COLLECTIONS = [
  "users",
  "wallets",
  "auth_challenges",
  "sessions",
  "rate_limits",
  "security_events",
] as const;

/** Every string value anywhere in a document, with its dotted path. */
function strings(value: unknown, path = ""): { path: string; value: string }[] {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}.${i}`));
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    if ("toHexString" in value) return [];
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

describe("acceptance criterion 3: nothing sensitive is persisted", () => {
  it("stores no raw token, signature, nonce field, IP or email after the happy path", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const signedIn = await signIn(client, wallet);
    const token = client.cookie ?? "";
    const nonce = parseSignInMessage(signedIn.challenge.message)?.nonce ?? "";
    await linkWallet(client, createTestWallet());
    await client.call(logoutRoute.POST, {
      method: "POST",
      path: "/api/v1/auth/logout",
      headers: { "x-forwarded-for": "203.0.113.77" },
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const db = await getDb();
    const found: { collection: string; path: string; value: string }[] = [];
    for (const collection of COLLECTIONS) {
      for (const doc of await db.collection(collection).find({}).toArray()) {
        for (const entry of strings(doc)) found.push({ collection, ...entry });
      }
    }
    expect(found.length).toBeGreaterThan(0);

    const containing = (needle: string) => found.filter((f) => f.value.includes(needle));
    expect(containing(token)).toEqual([]);
    expect(containing(signedIn.signature)).toEqual([]);
    expect(found.filter((f) => f.value === nonce)).toEqual([]);
    // The nonce appears only inside the signed message of a consumed challenge.
    for (const hit of containing(nonce)) {
      expect(hit).toMatchObject({ collection: "auth_challenges", path: "message" });
    }
    const consumed = await db.collection("auth_challenges").find({ consumedAt: null }).toArray();
    expect(consumed.map((c) => c.message)).not.toContain(signedIn.challenge.message);
    expect(found.filter((f) => f.value === "unknown" || f.value.includes("203.0.113.77"))).toEqual(
      [],
    );
    expect(found.filter((f) => /\S+@\S+\.\S+/.test(f.value))).toEqual([]);
    for (const limit of await db.collection("rate_limits").find({}).toArray()) {
      expect(limit.key).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
