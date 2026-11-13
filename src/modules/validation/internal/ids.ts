import { z } from "zod";

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
const OBJECT_ID_LOWER = /^[0-9a-f]{24}$/;

export type ObjectIdString = string & { readonly __brand: "ObjectIdString" };

export const objectIdString: z.ZodType<ObjectIdString, string> = z
  .string({ error: "Must be a 24-character hex string" })
  .regex(OBJECT_ID_HEX, { error: "Must be a 24-character hex string" })
  .transform((value) => value.toLowerCase() as ObjectIdString);

export function isObjectIdString(value: unknown): value is ObjectIdString {
  return typeof value === "string" && OBJECT_ID_LOWER.test(value);
}
