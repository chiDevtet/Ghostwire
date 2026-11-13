import { z } from "zod";
import { objectIdSchema, registerIndexes, typedCollection, type WithId } from "@/modules/database";
import { solanaNetwork } from "@/modules/validation";
import { ADDRESS_PATTERN } from "./address";

export const WALLETS_COLLECTION = "wallets";
export const WALLET_STATUSES = ["active", "disconnected"] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];
/** Informational wallet label, e.g. "phantom". Never trusted for behaviour. */
export const PROVIDER_PATTERN = /^[a-z0-9_-]{1,32}$/;

/** No .default() and no .refine(): invariants are enforced by the code that writes. */
export const walletSchema = z.strictObject({
  userId: objectIdSchema,
  address: z.string().regex(ADDRESS_PATTERN),
  network: solanaNetwork,
  walletType: z.literal("external"),
  provider: z.string().regex(PROVIDER_PATTERN).nullable(),
  status: z.enum(WALLET_STATUSES),
  linkedAt: z.date(),
  updatedAt: z.date(),
});

export type WalletDoc = WithId<z.output<typeof walletSchema>>;

export const wallets = typedCollection(WALLETS_COLLECTION, walletSchema);

/** Registers the wallets indexes. Idempotent. Called by registerAuthIndexes(). */
export function registerWalletIndexes(): void {
  registerIndexes(WALLETS_COLLECTION, [
    { name: "wallets_address_network_unique", key: { address: 1, network: 1 }, unique: true },
    { name: "wallets_userId", key: { userId: 1 } },
  ]);
}
