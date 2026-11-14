import { useSyncExternalStore } from "react";
import { listSolanaWallets, subscribeWallets, type WalletEntry } from "./registry";

const EMPTY: readonly WalletEntry[] = Object.freeze([]);
const serverSnapshot = (): readonly WalletEntry[] => EMPTY;

/**
 * The Solana wallets in this browser. The server snapshot is [], so SSR and the first hydration
 * render show the empty state; late register events re-render.
 */
export function useWallets(): readonly WalletEntry[] {
  return useSyncExternalStore(subscribeWallets, listSolanaWallets, serverSnapshot);
}
