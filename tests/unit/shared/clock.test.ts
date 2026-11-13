import { afterEach, describe, expect, it } from "vitest";
import { now, resetClockForTests, setClockForTests } from "@/modules/shared";

afterEach(() => {
  resetClockForTests();
});

describe("clock", () => {
  it("defaults to the system time", () => {
    const before = Date.now();
    const value = now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  it("uses the test clock until reset", () => {
    const fixed = new Date("2026-11-13T10:00:00.000Z");
    setClockForTests(() => fixed);
    expect(now().toISOString()).toBe("2026-11-13T10:00:00.000Z");
    resetClockForTests();
    expect(now().getTime()).not.toBe(fixed.getTime());
  });

  it("returns a fresh Date on every call, so callers cannot mutate the clock", () => {
    const fixed = new Date("2026-11-13T10:00:00.000Z");
    setClockForTests(() => fixed);
    const first = now();
    first.setTime(0);
    expect(now().toISOString()).toBe("2026-11-13T10:00:00.000Z");
    expect(now()).not.toBe(now());
  });
});
