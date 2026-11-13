import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, parseObjectId } from "@/modules/database";
import { recordSecurityEvent, toSecurityReason } from "@/modules/security";
import { logger } from "@/modules/shared";

const AT = new Date("2026-11-13T10:00:00.000Z");
const USER = parseObjectId("64b7f0c2a1b2c3d4e5f60718");

beforeEach(async () => {
  const db = await getDb();
  await db.dropCollection("security_events").catch(() => undefined);
  await db.createCollection("security_events");
});

describe("recordSecurityEvent", () => {
  it("inserts the event with createdAt from `at`", async () => {
    await recordSecurityEvent({
      type: "signin_failed",
      severity: "warning",
      userId: USER,
      walletId: null,
      reason: "signature_invalid",
      at: AT,
    });
    const docs = await (await getDb()).collection("security_events").find({}).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      type: "signin_failed",
      severity: "warning",
      userId: USER,
      walletId: null,
      reason: "signature_invalid",
      createdAt: AT,
    });
  });

  it("never rejects when the insert fails, and logs a warning", async () => {
    await (await getDb()).command({ collMod: "security_events", validator: { $expr: false } });
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await expect(
      recordSecurityEvent({
        type: "session_revoked",
        severity: "info",
        userId: null,
        walletId: null,
        reason: "logout",
        at: AT,
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "security event write failed",
      expect.objectContaining({ type: "session_revoked" }),
    );
  });
});

describe("toSecurityReason", () => {
  it("maps known reasons and rejects anything else", () => {
    expect(toSecurityReason("user_inactive")).toBe("user_inactive");
    expect(toSecurityReason("something else")).toBeNull();
  });
});
