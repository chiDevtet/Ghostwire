import { z } from "zod";
import { objectIdSchema, typedCollection, type WithId } from "@/modules/database";
import { SOLANA_NETWORK_IDS } from "@/modules/wallet";

const HEX64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const network = z.enum(SOLANA_NETWORK_IDS);

export const USERS_COLLECTION = "users";
export const CHALLENGES_COLLECTION = "auth_challenges";
export const SESSIONS_COLLECTION = "sessions";

export const USER_STATUSES = ["active", "suspended", "deleted"] as const;

/** No .default() and no .refine() in any schema: invariants are enforced by the writers. */
export const userSchema = z.strictObject({
  status: z.enum(USER_STATUSES),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const challengeSchema = z.strictObject({
  /** sha256Hex(nonce). The raw nonce exists only inside `message`. */
  nonceHash: z.string().regex(HEX64),
  /** The exact signed text. */
  message: z.string().min(1).max(1024),
  address: z.string().regex(ADDRESS),
  network,
  purpose: z.enum(["signin", "link"]),
  /** Set for link (the session user), null for signin. */
  userId: objectIdSchema.nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
  consumedAt: z.date().nullable(),
});

export const sessionSchema = z.strictObject({
  /** sha256Hex(token). The raw token exists only in the cookie. */
  tokenHash: z.string().regex(HEX64),
  userId: objectIdSchema,
  /** The wallet used to sign in. */
  walletId: objectIdSchema,
  network,
  createdAt: z.date(),
  lastSeenAt: z.date(),
  /** Idle expiry, sliding (written at most once per hour). */
  expiresAt: z.date(),
  absoluteExpiresAt: z.date(),
  revokedAt: z.date().nullable(),
  userAgent: z.string().max(128).nullable(),
});

export type UserDoc = WithId<z.output<typeof userSchema>>;
export type ChallengeDoc = WithId<z.output<typeof challengeSchema>>;
export type SessionDoc = WithId<z.output<typeof sessionSchema>>;

export const users = typedCollection(USERS_COLLECTION, userSchema);
export const challenges = typedCollection(CHALLENGES_COLLECTION, challengeSchema);
export const sessions = typedCollection(SESSIONS_COLLECTION, sessionSchema);
