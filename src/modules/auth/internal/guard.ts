/**
 * A write-skew guard must really change the document: MongoDB treats an update that sets a field
 * to its current value as a no-op, and a no-op takes no write lock, so it cannot conflict.
 * Returns `at`, or one millisecond after `previous` when `at` is not later than it.
 */
export function strictlyAfter(at: Date, previous: Date): Date {
  return new Date(Math.max(at.getTime(), previous.getTime() + 1));
}
