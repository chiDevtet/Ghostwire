import { z } from "zod";
import { safeEquals, typedCollection } from "@/modules/database";
import { ConflictError, RateLimitedError, logger } from "@/modules/shared";
import { recordSecurityEvent } from "./events";
import { sha256Hex } from "./tokens";

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_WINDOW_SECONDS = 86_400;

export const RATE_LIMITS_COLLECTION = "rate_limits";

const rateLimitSchema = z.strictObject({
  key: z.string().regex(HEX64),
  windowStart: z.date(),
  count: z.number().int().min(1),
  expiresAt: z.date(),
});

const rateLimits = typedCollection(RATE_LIMITS_COLLECTION, rateLimitSchema);

export interface FixedWindow {
  /** floor(at / windowSeconds) * windowSeconds */
  readonly windowStart: Date;
  /** windowStart + windowSeconds */
  readonly windowEnd: Date;
  /** max(1, ceil((windowEnd - at) / 1000)) */
  readonly retryAfterSeconds: number;
}

/** Pure window maths. @throws RangeError unless windowSeconds is an integer in [1, 86400] */
export function fixedWindow(at: Date, windowSeconds: number): FixedWindow {
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > MAX_WINDOW_SECONDS) {
    throw new RangeError(`windowSeconds must be an integer in [1, ${MAX_WINDOW_SECONDS}]`);
  }
  const windowMs = windowSeconds * 1000;
  const startMs = Math.floor(at.getTime() / windowMs) * windowMs;
  const endMs = startMs + windowMs;
  return {
    windowStart: new Date(startMs),
    windowEnd: new Date(endMs),
    retryAfterSeconds: Math.max(1, Math.ceil((endMs - at.getTime()) / 1000)),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "DUPLICATE_KEY";
}

/**
 * Counts one hit for `key` ("<route>:<kind>:<subject>", stored only as sha256Hex(key)) in the
 * current fixed window. Rejected hits still count, so a flood keeps its own bucket full.
 * @throws RangeError for an invalid limit or window
 * @throws RateLimitedError when the post-increment count exceeds limit (after a best-effort
 *         rate_limited event); DependencyUnavailableError when the database is down (fail closed)
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  at: Date,
): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be an integer >= 1");
  const window = fixedWindow(at, windowSeconds);
  const filter = Object.assign(
    {},
    safeEquals("key", sha256Hex(key)),
    safeEquals("windowStart", window.windowStart),
  );
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: window.windowEnd } };
  const options = { upsert: true, returnDocument: "after" } as const;
  let doc;
  try {
    doc = await rateLimits.findOneAndUpdate(filter, update, options);
  } catch (error) {
    // Concurrent first hits of a new window: the unique index admits one insert. The server
    // normally retries the losers itself; this single retry is defence in depth.
    if (!isDuplicateKey(error)) throw error;
    doc = await rateLimits.findOneAndUpdate(filter, update, options);
  }
  if (doc === null || doc.count > limit) {
    logger.warn("rate limited", { route: key.split(":")[0] ?? "" });
    await recordSecurityEvent({
      type: "rate_limited",
      severity: "warning",
      userId: null,
      walletId: null,
      reason: "rate_limit_exceeded",
      at,
    });
    throw new RateLimitedError(window.retryAfterSeconds);
  }
}
