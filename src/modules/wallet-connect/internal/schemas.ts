import * as z from "zod/mini";
import type { SolanaNetwork } from "@/modules/validation";

/**
 * Client copies of the 02a response shapes (route handlers, auth/internal/types.ts,
 * wallet/internal/repository.ts). Non-strict objects strip unknown keys, so a server that adds a
 * field does not break the client.
 */
const objectId = z.string().check(z.regex(/^[0-9a-f]{24}$/));
/** ISO-8601 from toISOString(). */
const isoDate = z.string().check(z.minLength(1));
/** Duplicates SOLANA_NETWORK_IDS so the client never loads validation's runtime (full zod). */
const networkSchema = z.enum(["devnet", "mainnet-beta"]);

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Compile-time guard: fails typecheck if the enum drifts from SolanaNetwork. */
export const NETWORK_SCHEMA_MATCHES: AssertEqual<
  z.infer<typeof networkSchema>,
  SolanaNetwork
> = true;

export const errorBodySchema = z.object({ code: z.string(), message: z.string() });

/** POST /auth/challenge and POST /wallets/link/challenge → 200 */
export const challengeSchema = z.object({
  challengeId: objectId,
  message: z.string(),
  expiresAt: isoDate,
});

/** POST /auth/verify → 200 { user, wallet } (+ Set-Cookie) */
export const signInSchema = z.object({
  user: z.object({ id: objectId }),
  wallet: z.object({ id: objectId, address: z.string(), network: networkSchema }),
});

/** WalletView */
export const walletItemSchema = z.object({
  id: objectId,
  address: z.string(),
  network: networkSchema,
  provider: z.nullable(z.string()),
  status: z.enum(["active", "disconnected"]),
  linkedAt: isoDate,
});

/** POST /wallets/link/verify → 201 (created) or 200 (already linked) { wallet } */
export const linkSchema = z.object({ wallet: walletItemSchema });

/** GET /me → 200 */
export const meSchema = z.object({
  user: z.object({ id: objectId, createdAt: isoDate }),
  session: z.object({ id: objectId, network: networkSchema, expiresAt: isoDate }),
  wallets: z.array(walletItemSchema),
});

/** GET /wallets → 200 */
export const walletsSchema = z.object({ wallets: z.array(walletItemSchema) });

/** SessionView */
export const sessionItemSchema = z.object({
  id: objectId,
  current: z.boolean(),
  createdAt: isoDate,
  lastSeenAt: isoDate,
  expiresAt: isoDate,
  network: networkSchema,
  userAgent: z.nullable(z.string()),
});

/** GET /sessions → 200 */
export const sessionsSchema = z.object({ sessions: z.array(sessionItemSchema) });

export type ChallengeData = z.infer<typeof challengeSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type WalletItem = z.infer<typeof walletItemSchema>;
/** created is true when the server answered 201. */
export interface LinkData {
  readonly wallet: WalletItem;
  readonly created: boolean;
}
export type MeData = z.infer<typeof meSchema>;
export type SessionItem = z.infer<typeof sessionItemSchema>;
