import { z } from "zod";
import { objectIdSchema, typedCollection, type ObjectId } from "@/modules/database";
import { logger } from "@/modules/shared";

export const SECURITY_EVENT_TYPES = [
  "signin_success",
  "signin_failed",
  "wallet_linked",
  "link_failed",
  "wallet_unlinked",
  "session_revoked",
  "rate_limited",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_SEVERITIES = ["info", "warning", "critical"] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

/** Static reasons only. Never a value derived from the request. */
export const SECURITY_REASONS = [
  "challenge_unavailable",
  "message_integrity",
  "network_unsupported",
  "signature_invalid",
  "user_inactive",
  "wallet_other_account",
  "rate_limit_exceeded",
  "logout",
  "user_revoked",
  "wallet_unlinked",
] as const;
export type SecurityReason = (typeof SECURITY_REASONS)[number];

export interface SecurityEventInput {
  readonly type: SecurityEventType;
  readonly severity: SecuritySeverity;
  readonly userId: ObjectId | null;
  readonly walletId: ObjectId | null;
  readonly reason: SecurityReason | null;
  readonly at: Date;
}

export const SECURITY_EVENTS_COLLECTION = "security_events";

const securityEventSchema = z.strictObject({
  type: z.enum(SECURITY_EVENT_TYPES),
  severity: z.enum(SECURITY_SEVERITIES),
  userId: objectIdSchema.nullable(),
  walletId: objectIdSchema.nullable(),
  reason: z.enum(SECURITY_REASONS).nullable(),
  createdAt: z.date(),
});

const events = typedCollection(SECURITY_EVENTS_COLLECTION, securityEventSchema);

/** The matching static reason, or null when value is not one. */
export function toSecurityReason(value: string): SecurityReason | null {
  return SECURITY_REASONS.find((reason) => reason === value) ?? null;
}

/**
 * Best effort and awaited: never rejects. A failed insert is logged at warn. Never call it inside
 * a withTransaction fn (it would roll back and could run more than once).
 */
export async function recordSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    await events.insertOne({
      type: event.type,
      severity: event.severity,
      userId: event.userId,
      walletId: event.walletId,
      reason: event.reason,
      createdAt: event.at,
    });
  } catch (error) {
    logger.warn("security event write failed", { type: event.type, err: error });
  }
}
