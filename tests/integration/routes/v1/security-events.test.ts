import { describe, expect, it, vi } from "vitest";
import * as meRoute from "@/app/api/v1/me/route";
import { getDb } from "@/modules/database";
import { logger } from "@/modules/shared";
import { signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";

describe("security events are best effort", () => {
  it("still signs in (200 + cookie) when every security_events insert fails", async () => {
    const db = await getDb();
    await db.createCollection("security_events").catch(() => undefined);
    await db.command({ collMod: "security_events", validator: { $expr: false } });
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    expect(client.cookie).not.toBeNull();
    expect((await client.call(meRoute.GET, { method: "GET", path: "/api/v1/me" })).status).toBe(
      200,
    );
    expect(warn).toHaveBeenCalledWith(
      "security event write failed",
      expect.objectContaining({ type: "signin_success" }),
    );
    expect(await db.collection("security_events").countDocuments({})).toBe(0);
  });
});
