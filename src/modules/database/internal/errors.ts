import { MongoError } from "mongodb";

const MAX_CAUSE_DEPTH = 5;

/**
 * True if `error` or any link in its `cause` chain (up to depth 5) is a MongoError carrying `label`.
 * The walk matters because typedCollection wraps driver errors in AppErrors with the driver error as cause.
 */
export function hasErrorLabelDeep(error: unknown, label: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (current instanceof MongoError && current.hasErrorLabel(label)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
