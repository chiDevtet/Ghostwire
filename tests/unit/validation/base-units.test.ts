import { describe, expect, expectTypeOf, it } from "vitest";
import { baseUnits } from "@/modules/validation";
import type { BaseUnits } from "@/modules/validation";

describe("BaseUnits type contract", () => {
  it("does not accept a JS number as a BaseUnits amount", () => {
    expectTypeOf<number>().not.toExtend<BaseUnits>();
  });
});

describe("baseUnits", () => {
  it.each<[string, bigint]>([
    ["0", 0n],
    ["18446744073709551616", 18446744073709551616n],
    ["1000000", 1000000n],
  ])("accepts the string %s", (input, expected) => {
    expect(baseUnits.parse(input)).toBe(expected);
  });

  it("accepts non-negative bigints unchanged", () => {
    expect(baseUnits.parse(5n)).toBe(5n);
    expect(baseUnits.parse(0n)).toBe(0n);
  });

  it.each([1.5, 1, 0, -1, Number.NaN])("rejects the JS number %s", (input) => {
    expect(baseUnits.safeParse(input).success).toBe(false);
  });

  it.each(["1.5", "-1", "1e3", " 1", "1 ", "01", "00", "", "+1", "0x10", "1_000"])(
    "rejects the string %j",
    (input) => {
      expect(baseUnits.safeParse(input).success).toBe(false);
    },
  );

  it("rejects negative bigints", () => {
    expect(baseUnits.safeParse(-1n).success).toBe(false);
  });

  it.each([null, undefined, true, {}, []])("rejects the non-amount value %j", (input) => {
    expect(baseUnits.safeParse(input).success).toBe(false);
  });

  it("never echoes the input in its issues", () => {
    const result = baseUnits.safeParse("99SENTINEL99");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain("SENTINEL");
  });
});
