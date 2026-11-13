import { z } from "zod";

/** Solana clusters the app accepts at all. The runtime allowlist is config SOLANA_NETWORKS. */
export const SOLANA_NETWORK_IDS = ["devnet", "mainnet-beta"] as const;
export type SolanaNetwork = (typeof SOLANA_NETWORK_IDS)[number];

export const solanaNetwork = z.enum(SOLANA_NETWORK_IDS);
