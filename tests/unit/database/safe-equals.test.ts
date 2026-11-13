import { describe, expect, it } from "vitest";
import { parseObjectId, safeEquals } from "@/modules/database";
import { InternalError, ValidationError } from "@/modules/shared";

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

const OID = parseObjectId("64b7f0c2a1b2c3d4e5f60718");

describe("safeEquals (entry gate 3)", () => {
  it("accepts the six scalar kinds and builds { [field]: value }", () => {
    if (OID === null) throw new Error("fixture ObjectId failed to parse");
    const at = new Date("2026-11-13T00:00:00.000Z");
    expect(safeEquals("a", "x")).toEqual({ a: "x" });
    expect(safeEquals("a", 0)).toEqual({ a: 0 });
    expect(safeEquals("a", false)).toEqual({ a: false });
    expect(safeEquals("a", 10n)).toEqual({ a: 10n });
    expect(safeEquals("a", at)).toEqual({ a: at });
    expect(safeEquals("_id", OID)).toEqual({ _id: OID });
    expect(safeEquals("nested.path_1", "x")).toEqual({ "nested.path_1": "x" });
  });

  it.each([
    { label: "{ $ne: 1 }", value: { $ne: 1 } },
    { label: '{ $gt: "" }', value: { $gt: "" } },
    { label: "[]", value: [] },
    { label: '["a"]', value: ["a"] },
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "{}", value: {} },
    { label: "an invalid Date", value: new Date("not a date") },
    { label: "a function", value: () => "x" },
    { label: "a symbol", value: Symbol("x") },
    { label: "a RegExp", value: /x/ },
  ])("rejects $label with ValidationError FILTER_INVALID", ({ value }) => {
    const error = thrownBy(() => safeEquals("field", value as unknown as string));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("FILTER_INVALID");
    expect((error as ValidationError).httpStatus).toBe(400);
  });

  it.each(["$where", "a.$gt", "", "a..b", ".a", "a b", "1a"])(
    "rejects the field name %j with InternalError FILTER_FIELD_INVALID",
    (field) => {
      const error = thrownBy(() => safeEquals(field, "x"));
      expect(error).toBeInstanceOf(InternalError);
      expect((error as InternalError).code).toBe("FILTER_FIELD_INVALID");
    },
  );

  it("never echoes the rejected value in the error message", () => {
    const error = thrownBy(() =>
      safeEquals("tokenHash", { $ne: "SENTINEL" } as unknown as string),
    ) as ValidationError;
    expect(error.message).not.toContain("SENTINEL");
  });
});
