import { describe, expect, expectTypeOf, it } from "vitest";
import { isObjectIdString, objectIdString } from "@/modules/validation";
import type { ObjectIdString } from "@/modules/validation";

const LOWER = "507f1f77bcf86cd799439011";

describe("objectIdString", () => {
  it("accepts a lowercase 24-hex string", () => {
    expect(objectIdString.parse(LOWER)).toBe(LOWER);
  });

  it("normalizes uppercase hex to lowercase", () => {
    expect(objectIdString.parse(LOWER.toUpperCase())).toBe(LOWER);
  });

  it.each([LOWER.slice(0, 23), `${LOWER}0`, "g".repeat(24), "", 123, null])(
    "rejects %j",
    (input) => {
      expect(objectIdString.safeParse(input).success).toBe(false);
    },
  );
});

describe("ObjectIdString type contract", () => {
  it("does not accept a plain string as an ObjectIdString", () => {
    expectTypeOf<string>().not.toExtend<ObjectIdString>();
  });

  it("types the output of objectIdString.parse as ObjectIdString", () => {
    expectTypeOf(objectIdString.parse(LOWER)).toEqualTypeOf<ObjectIdString>();
  });
});

describe("isObjectIdString", () => {
  it("is true for a lowercase 24-hex string", () => {
    expect(isObjectIdString(LOWER)).toBe(true);
  });

  it("is false for uppercase, wrong length and non-strings", () => {
    expect(isObjectIdString(LOWER.toUpperCase())).toBe(false);
    expect(isObjectIdString(LOWER.slice(1))).toBe(false);
    expect(isObjectIdString(42)).toBe(false);
  });
});
