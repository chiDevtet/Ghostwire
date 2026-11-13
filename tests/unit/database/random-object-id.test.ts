import { describe, expect, it } from "vitest";
import { parseObjectId, randomObjectId } from "@/modules/database";

describe("randomObjectId", () => {
  it("returns valid, distinct, non-sequential ids", () => {
    const ids = Array.from({ length: 1000 }, () => randomObjectId().toHexString());
    for (const hex of ids) expect(parseObjectId(hex)?.toHexString()).toBe(hex);
    expect(new Set(ids).size).toBe(1000);
    // The driver default shares a 4-byte time prefix and a 5-byte process value; random ids do not.
    expect(new Set(ids.map((hex) => hex.slice(0, 8))).size).toBeGreaterThan(900);
    expect(new Set(ids.map((hex) => hex.slice(8, 18))).size).toBeGreaterThan(900);
  });
});
