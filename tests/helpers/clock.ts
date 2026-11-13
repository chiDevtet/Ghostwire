import { setClockForTests } from "@/modules/shared";

export interface TestClock {
  now(): Date;
  advance(ms: number): void;
  set(at: Date): void;
}

/**
 * Drives the shared clock (now()) from a test. Only application time moves; the MongoDB driver
 * and timers keep real time. The integration setup resets the clock after every test; unit
 * tests call resetClockForTests() themselves.
 */
export function useTestClock(start: Date): TestClock {
  let current = start.getTime();
  setClockForTests(() => new Date(current));
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
    set(at) {
      current = at.getTime();
    },
  };
}
