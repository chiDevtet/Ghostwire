import { describe, expect, it } from "vitest";
import { fixedWindow } from "@/modules/security";

describe("fixedWindow", () => {
  it("aligns a 60 s window to the minute", () => {
    const window = fixedWindow(new Date("2026-11-13T10:00:30.250Z"), 60);
    expect(window.windowStart.toISOString()).toBe("2026-11-13T10:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-11-13T10:01:00.000Z");
    expect(window.retryAfterSeconds).toBe(30);
  });

  it("aligns a 3600 s window to the hour", () => {
    const window = fixedWindow(new Date("2026-11-13T10:59:59.000Z"), 3600);
    expect(window.windowStart.toISOString()).toBe("2026-11-13T10:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-11-13T11:00:00.000Z");
    expect(window.retryAfterSeconds).toBe(1);
  });

  it("returns the full window at its first millisecond and 1 at its last", () => {
    expect(fixedWindow(new Date("2026-11-13T10:00:00.000Z"), 60).retryAfterSeconds).toBe(60);
    expect(fixedWindow(new Date("2026-11-13T10:00:59.999Z"), 60).retryAfterSeconds).toBe(1);
  });

  it("starts a new window exactly at the boundary", () => {
    const window = fixedWindow(new Date("2026-11-13T10:01:00.000Z"), 60);
    expect(window.windowStart.toISOString()).toBe("2026-11-13T10:01:00.000Z");
  });

  it.each([0, 86_401, 1.5, Number.NaN, -60])(
    "throws RangeError for windowSeconds %s",
    (seconds) => {
      expect(() => fixedWindow(new Date(), seconds)).toThrow(RangeError);
    },
  );
});
