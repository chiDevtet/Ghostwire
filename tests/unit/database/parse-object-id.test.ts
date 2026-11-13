import { describe, expect, it } from "vitest";
import { objectIdSchema, parseObjectId } from "@/modules/database";

describe("parseObjectId", () => {
  it("parses 24 hex characters of either case to the same lowercase ObjectId", () => {
    const lower = parseObjectId("64b7f0c2a1b2c3d4e5f60718");
    const upper = parseObjectId("64B7F0C2A1B2C3D4E5F60718");
    expect(lower?.toHexString()).toBe("64b7f0c2a1b2c3d4e5f60718");
    expect(upper?.toHexString()).toBe("64b7f0c2a1b2c3d4e5f60718");
  });

  it.each([
    "64b7f0c2a1b2c3d4e5f6071",
    "64b7f0c2a1b2c3d4e5f607180",
    "64b7f0c2a1b2c3d4e5f6071g",
    " 64b7f0c2a1b2c3d4e5f60718",
    "",
    123,
    null,
    undefined,
    { $ne: 1 },
    ["64b7f0c2a1b2c3d4e5f60718"],
  ])("returns null for %j", (value) => {
    expect(parseObjectId(value)).toBeNull();
  });
});

describe("objectIdSchema", () => {
  it("accepts an ObjectId and rejects a hex string", () => {
    const id = parseObjectId("64b7f0c2a1b2c3d4e5f60718");
    expect(objectIdSchema.safeParse(id).success).toBe(true);
    expect(objectIdSchema.safeParse("64b7f0c2a1b2c3d4e5f60718").success).toBe(false);
  });
});
