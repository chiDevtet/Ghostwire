import { describe, expect, it } from "vitest";
import { NotFoundError, err, isOk, ok, type Result } from "@/modules/shared";

describe("Result", () => {
  it("ok wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("err wraps an error", () => {
    const error = new NotFoundError();
    expect(err(error)).toEqual({ ok: false, error });
  });

  it("isOk narrows both branches", () => {
    const results: Result<number>[] = [ok(1), err(new NotFoundError())];
    const values = results.map((r) => (isOk(r) ? r.value : r.error.code));
    expect(values).toEqual([1, "NOT_FOUND"]);
  });
});
