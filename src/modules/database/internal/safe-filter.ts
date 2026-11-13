import { ObjectId } from "mongodb";
import { InternalError, ValidationError } from "@/modules/shared";

export type SafeScalar = string | number | boolean | bigint | Date | ObjectId;

/** Dotted field path; no "$", no empty segment. */
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function isSafeScalar(value: unknown): value is SafeScalar {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      return true;
    case "object":
      if (value instanceof Date) return !Number.isNaN(value.getTime());
      return value instanceof ObjectId;
    default:
      return false;
  }
}

/**
 * Builds `{ [field]: value }` only for a scalar value. The ONLY permitted way to put a
 * request-derived or otherwise variable value into a filter (see typedCollection). Server
 * constants (`revokedAt: null`, `status: "active"`, `expiresAt: { $gt: now }`) are written
 * literally next to it. Accepts values that bypassed static typing and checks them at runtime.
 * Compose several fields with `Object.assign({}, safeEquals("a", x), safeEquals("b", y))`.
 * @throws ValidationError({ code: "FILTER_INVALID" }) when value is not a SafeScalar (object,
 *         array, null, undefined, function, symbol, an invalid Date, an operator object).
 * @throws InternalError({ code: "FILTER_FIELD_INVALID" }) when field is not a plain dotted path.
 */
export function safeEquals<K extends string, V extends SafeScalar>(
  field: K,
  value: V,
): { readonly [P in K]: V } {
  if (!FIELD_PATH.test(field)) {
    throw new InternalError({
      code: "FILTER_FIELD_INVALID",
      message: `invalid filter field ${JSON.stringify(field)}`,
    });
  }
  if (!isSafeScalar(value as unknown)) {
    throw new ValidationError({
      code: "FILTER_INVALID",
      message: `filter value for ${field} is not a scalar`,
    });
  }
  return { [field]: value } as { readonly [P in K]: V };
}
