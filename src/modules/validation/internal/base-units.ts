import { z } from "zod";

const BASE_UNITS_STRING = /^(0|[1-9][0-9]*)$/;

/**
 * Integer amount in an asset's smallest unit. Accepts a non-negative bigint or a canonical
 * decimal string and always outputs bigint. Never accepts a JS number (no floating point).
 * No upper bound here: asset-specific bounds belong to the payments module.
 */
export const baseUnits: z.ZodType<bigint, bigint | string> = z.union([
  z
    .bigint({ error: "Must be a bigint or a base-units integer string" })
    .nonnegative({ error: "Must not be negative" }),
  z
    .string({ error: "Must be a bigint or a base-units integer string" })
    .regex(BASE_UNITS_STRING, {
      error: "Must be a non-negative integer string without leading zeros",
    })
    .transform((value) => BigInt(value)),
]);

export type BaseUnits = bigint;
