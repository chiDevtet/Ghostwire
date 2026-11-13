import { registerIndexes } from "@/modules/database";
import { SECURITY_EVENTS_COLLECTION } from "./events";
import { RATE_LIMITS_COLLECTION } from "./rate-limit";

/** Registers the rate_limits and security_events indexes. Idempotent. Called by registerAuthIndexes(). */
export function registerSecurityIndexes(): void {
  registerIndexes(RATE_LIMITS_COLLECTION, [
    { name: "rate_limits_key_windowStart_unique", key: { key: 1, windowStart: 1 }, unique: true },
    { name: "rate_limits_expiresAt_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);
  registerIndexes(SECURITY_EVENTS_COLLECTION, [
    { name: "security_events_userId_createdAt", key: { userId: 1, createdAt: -1 } },
  ]);
}
