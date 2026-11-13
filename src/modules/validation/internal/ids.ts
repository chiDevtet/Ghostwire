import { z } from "zod";

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
const OBJECT_ID_LOWER = /^[0-9a-f]{24}$/;

export const objectIdString = z
  .string({ error: "Must be a 24-character hex string" })
  .regex(OBJECT_ID_HEX, { error: "Must be a 24-character hex string" })
  .transform((value) => value.toLowerCase())
  .brand<"ObjectIdString">();

export type ObjectIdString = z.output<typeof objectIdString>;

export function isObjectIdString(value: unknown): value is ObjectIdString {
  return typeof value === "string" && OBJECT_ID_LOWER.test(value);
}
