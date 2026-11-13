import { describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import type { RouteHandler } from "@/modules/auth";
import { getDb } from "@/modules/database";
import { parseSignInMessage } from "@/modules/wallet";
import { linkWallet, requestChallenge, signIn, verify } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { useEnv } from "../../../helpers/env";
import { TestClient, type CallOptions } from "../../../helpers/http";

const COLLECTIONS = [
  "users",
  "wallets",
  "auth_challenges",
  "sessions",
  "rate_limits",
  "security_events",
] as const;

const IP = "203.0.113.77";
const BYTE_ENCODINGS = ["hex", "base64", "base64url", "utf8"] as const;

/** Sends X-Forwarded-For on every call, so (with TRUST_PROXY=true) the server really sees IP. */
class ProxiedClient extends TestClient {
  override call<P extends object>(handler: RouteHandler<P>, options: CallOptions) {
    return super.call(handler, {
      ...options,
      headers: { ...options.headers, "x-forwarded-for": IP },
    });
  }
}

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { _bsontype?: unknown })._bsontype === "Binary"
  ) {
    const raw = (value as { value?: unknown }).value;
    const bytes = typeof raw === "function" ? (raw as () => unknown).call(value) : raw;
    if (bytes instanceof Uint8Array) return bytes;
    if (typeof bytes === "string") return Buffer.from(bytes, "latin1");
    const buffer = (value as { buffer?: unknown }).buffer;
    if (buffer instanceof Uint8Array) return buffer;
  }
  return null;
}

/**
 * Every string value anywhere in a document, with its dotted path. Numbers are included as
 * decimal strings, and Binary / Buffer / Uint8Array values as their bytes in hex, base64,
 * base64url and utf8. ObjectIds are skipped.
 */
function strings(value: unknown, path = ""): { path: string; value: string }[] {
  if (typeof value === "string") return [{ path, value }];
  if (typeof value === "number" || typeof value === "bigint") {
    return [{ path, value: String(value) }];
  }
  const bytes = bytesOf(value);
  if (bytes !== null) {
    return BYTE_ENCODINGS.map((encoding) => ({
      path: `${path}#${encoding}`,
      value: Buffer.from(bytes).toString(encoding),
    }));
  }
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}.${i}`));
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    if ("toHexString" in value) return [];
    return Object.entries(value).flatMap(([key, item]) =>
      strings(item, path === "" ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** A needle in every textual form its raw bytes could be stored as. */
function forms(raw: Buffer): string[] {
  return BYTE_ENCODINGS.map((encoding) => raw.toString(encoding));
}

describe("acceptance criterion 3: nothing sensitive is persisted", () => {
  it("stores no raw token, signature, nonce field, IP or email after the happy path", async () => {
    const restoreEnv = useEnv({ TRUST_PROXY: "true" });
    try {
      const client = new ProxiedClient();
      const wallet = createTestWallet();
      const signedIn = await signIn(client, wallet);
      const token = client.cookie ?? "";
      const nonce = parseSignInMessage(signedIn.challenge.message)?.nonce ?? "";
      await linkWallet(client, createTestWallet());
      // A failed sign-in also writes security events and rate limits.
      const failed = await requestChallenge(new ProxiedClient(), createTestWallet());
      await verify(new ProxiedClient(), failed, signedIn.signature);
      await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);

      const db = await getDb();
      const found: { collection: string; path: string; value: string }[] = [];
      const documents = new Map<string, number>();
      for (const collection of COLLECTIONS) {
        const docs = await db.collection(collection).find({}).toArray();
        documents.set(collection, docs.length);
        for (const doc of docs) {
          for (const entry of strings(doc)) found.push({ collection, ...entry });
        }
      }
      // Positive controls: the scan really looked at every collection.
      for (const collection of COLLECTIONS) {
        expect(documents.get(collection) ?? 0, collection).toBeGreaterThan(0);
      }
      expect(found.length).toBeGreaterThan(0);

      const containing = (needle: string) => found.filter((f) => f.value.includes(needle));
      const tokenBytes = Buffer.from(token, "base64url");
      for (const needle of [token, ...forms(tokenBytes)]) {
        expect(containing(needle)).toEqual([]);
      }
      expect(containing(signedIn.signature)).toEqual([]);
      expect(found.filter((f) => f.value === nonce)).toEqual([]);
      for (const needle of forms(Buffer.from(nonce, "base64url"))) {
        for (const hit of containing(needle)) {
          expect(hit).toMatchObject({ collection: "auth_challenges", path: "message" });
        }
      }
      // The nonce appears only inside the signed message of a consumed challenge.
      const nonceHits = containing(nonce);
      expect(nonceHits.length).toBeGreaterThanOrEqual(1);
      for (const hit of nonceHits) {
        expect(hit).toMatchObject({ collection: "auth_challenges", path: "message" });
      }
      const consumed = await db.collection("auth_challenges").find({ consumedAt: null }).toArray();
      expect(consumed.map((c) => c.message)).not.toContain(signedIn.challenge.message);

      // The client IP, in any form, is stored nowhere (it was sent and trusted).
      const ipBytes = Buffer.from(IP.split(".").map(Number));
      const ipNeedles = [
        IP,
        "203.0.113",
        ...forms(ipBytes),
        String(ipBytes.readUInt32BE(0)),
        `::ffff:${IP}`,
      ];
      for (const needle of ipNeedles) expect(containing(needle), needle).toEqual([]);
      expect(found.filter((f) => f.value === "unknown")).toEqual([]);
      expect(found.filter((f) => /\S+@\S+\.\S+/.test(f.value))).toEqual([]);

      const limits = await db.collection("rate_limits").find({}).toArray();
      expect(limits.length).toBeGreaterThan(0);
      for (const limit of limits) expect(limit.key).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      restoreEnv();
    }
  });
});
