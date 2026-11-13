import {
  MongoError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from "mongodb";
import { ConflictError, DependencyUnavailableError } from "@/modules/shared";

const MAX_CAUSE_DEPTH = 5;
const DUPLICATE_KEY_CODE = 11000;

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

/**
 * Connectivity -> DependencyUnavailableError; duplicate key -> ConflictError("DUPLICATE_KEY");
 * anything else is returned unchanged. Connectivity errors keep the driver error as `cause`, so
 * transaction labels survive the mapping. Duplicate-key errors carry a sanitized cause instead
 * (the driver message and stack contain the duplicated value); 11000 has no transient labels.
 */
export function mapMongoError(error: unknown): unknown {
  if (
    error instanceof MongoServerSelectionError ||
    error instanceof MongoNetworkError ||
    error instanceof MongoTopologyClosedError ||
    error instanceof MongoNotConnectedError
  ) {
    return new DependencyUnavailableError("database", {
      message: "MongoDB operation failed: database unreachable",
      cause: error,
    });
  }
  if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
    return new ConflictError({
      code: "DUPLICATE_KEY",
      safeMessage: "Resource already exists",
      // Never the driver error: its message and stack carry the duplicated key value.
      cause: Object.assign(new Error("duplicate key"), { code: DUPLICATE_KEY_CODE }),
    });
  }
  return error;
}
