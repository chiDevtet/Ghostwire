import { ensureIndexesOnce, registerIndexes } from "@/modules/database";
import { registerSecurityIndexes } from "@/modules/security";
import { registerWalletIndexes } from "@/modules/wallet";
import { CHALLENGES_COLLECTION, SESSIONS_COLLECTION } from "./collections";

/**
 * Registers every index the auth flows rely on: wallets, rate_limits, security_events,
 * auth_challenges and sessions. users has none. Idempotent (identical specs are a no-op).
 */
export function registerAuthIndexes(): void {
  registerWalletIndexes();
  registerSecurityIndexes();
  registerIndexes(CHALLENGES_COLLECTION, [
    { name: "auth_challenges_nonceHash_unique", key: { nonceHash: 1 }, unique: true },
    { name: "auth_challenges_expiresAt_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 3600 },
  ]);
  registerIndexes(SESSIONS_COLLECTION, [
    { name: "sessions_tokenHash_unique", key: { tokenHash: 1 }, unique: true },
    { name: "sessions_userId", key: { userId: 1 } },
    {
      name: "sessions_absoluteExpiresAt_ttl",
      key: { absoluteExpiresAt: 1 },
      expireAfterSeconds: 0,
    },
  ]);
}

/**
 * The request gate: the unique indexes are correctness constraints, so every auth service
 * function awaits this before its first database operation. A resolved memo after the first
 * success. @throws InternalError("INDEX_CONFLICT"), DependencyUnavailableError
 */
export async function ensureAuthReady(): Promise<void> {
  registerAuthIndexes();
  await ensureIndexesOnce();
}
