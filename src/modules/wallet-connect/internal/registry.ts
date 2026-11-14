import { getWallets, type Wallets } from "@wallet-standard/app";
import type { Wallet, WalletIcon } from "@wallet-standard/base";
import { getConnect, getSignMessage, hasSolanaChain } from "./features";

export interface WalletEntry {
  /** Stable per Wallet object for the page lifetime: "w1", "w2", … */
  readonly id: string;
  readonly name: string;
  /** A data: URI (allowed by the CSP's img-src 'self' data:). */
  readonly icon: WalletIcon;
  readonly canSignIn: boolean;
  readonly wallet: Wallet;
}

let registry: Wallets | null = null;
let snapshot: readonly WalletEntry[] | null = null;
const listeners = new Set<() => void>();
const ids = new WeakMap<Wallet, string>();
let nextId = 1;

function changed(): void {
  snapshot = null;
  for (const listener of [...listeners]) listener();
}

/** getWallets() runs on first use, never at import time. One permanent subscription. */
function ensureRegistry(): Wallets {
  if (registry === null) {
    registry = getWallets();
    registry.on("register", changed);
    registry.on("unregister", changed);
  }
  return registry;
}

function idFor(wallet: Wallet): string {
  let id = ids.get(wallet);
  if (id === undefined) {
    id = `w${nextId}`;
    nextId += 1;
    ids.set(wallet, id);
  }
  return id;
}

/** Listed: a solana: chain or any solana: feature. EVM-only Wallet Standard wallets are not. */
function isListed(wallet: Wallet): boolean {
  return (
    hasSolanaChain(wallet) || Object.keys(wallet.features).some((key) => key.startsWith("solana:"))
  );
}

function toEntry(wallet: Wallet): WalletEntry {
  return {
    id: idFor(wallet),
    name: wallet.name,
    icon: wallet.icon,
    canSignIn:
      getConnect(wallet) !== null && getSignMessage(wallet) !== null && hasSolanaChain(wallet),
    wallet,
  };
}

/** Cached snapshot: the same array until a register/unregister event or refreshWallets(). */
export function listSolanaWallets(): readonly WalletEntry[] {
  if (snapshot === null) {
    const entries = ensureRegistry().get().filter(isListed).map(toEntry);
    snapshot = Object.freeze([
      ...entries.filter((entry) => entry.canSignIn),
      ...entries.filter((entry) => !entry.canSignIn),
    ]);
  }
  return snapshot;
}

/** Notified on every register/unregister and on refreshWallets(). Returns the unsubscribe. */
export function subscribeWallets(listener: () => void): () => void {
  ensureRegistry();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rebuilds the snapshot from getWallets().get() and notifies listeners (empty-state Refresh). */
export function refreshWallets(): void {
  ensureRegistry();
  changed();
}
