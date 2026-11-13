import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;

/** 24-hex (any case) -> ObjectId; anything else -> null. Never throws. */
export function parseObjectId(value: unknown): ObjectId | null {
  if (typeof value !== "string" || !OBJECT_ID_HEX.test(value)) return null;
  return ObjectId.createFromHexString(value.toLowerCase());
}

/** A fully random 96-bit ObjectId (unlike the driver default, not guessable from time or counter). */
export function randomObjectId(): ObjectId {
  return new ObjectId(randomBytes(12));
}

/** Zod schema for ObjectId-typed document fields. */
export const objectIdSchema = z.custom<ObjectId>(
  (value) => value instanceof ObjectId,
  "Must be an ObjectId",
);
