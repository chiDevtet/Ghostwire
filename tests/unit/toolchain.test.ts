import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("compiles bigint literals and runs on Node 24", () => {
    expect(2n ** 64n).toBe(18446744073709551616n);
    expect(process.versions.node.split(".")[0]).toBe("24");
  });
});
