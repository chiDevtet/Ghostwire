export type Clock = () => Date;

const systemClock: Clock = () => new Date();
let active: Clock = systemClock;

/** Current time from the active clock. Returns a fresh Date on every call. */
export function now(): Date {
  return new Date(active().getTime());
}

/** Test only: replaces the clock until resetClockForTests(). */
export function setClockForTests(clock: Clock): void {
  active = clock;
}

export function resetClockForTests(): void {
  active = systemClock;
}
