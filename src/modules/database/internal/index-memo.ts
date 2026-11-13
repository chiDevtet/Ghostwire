/**
 * The ensureIndexesOnce() memo, in its own file so client.ts (closeDb) and indexes.ts can both
 * clear it without importing each other.
 */
let memo: Promise<void> | undefined;

export function readIndexMemo(): Promise<void> | undefined {
  return memo;
}

export function writeIndexMemo(value: Promise<void> | undefined): void {
  memo = value;
}

export function clearIndexMemo(): void {
  memo = undefined;
}
