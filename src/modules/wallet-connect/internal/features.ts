import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import type { Wallet } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";

/** { version; connect(input?: { silent?: boolean }) → Promise<{ accounts }> } */
export type ConnectFeature = StandardConnectFeature[typeof StandardConnect];
/** { version; on("change", listener) → off } */
export type EventsFeature = StandardEventsFeature[typeof StandardEvents];
/** { version: "1.0.0" | "1.1.0"; signMessage(...inputs) → Promise<outputs> } */
export type SignMessageFeature = SolanaSignMessageFeature[typeof SolanaSignMessage];

/** The feature object when present with `method` as a function; otherwise null. Never throws. */
function feature<T>(wallet: Wallet, name: string, method: string): T | null {
  try {
    const value: unknown = (wallet.features as Readonly<Record<string, unknown>>)[name];
    if (typeof value !== "object" || value === null) return null;
    return typeof (value as Record<string, unknown>)[method] === "function" ? (value as T) : null;
  } catch {
    return null;
  }
}

export function getConnect(wallet: Wallet): ConnectFeature | null {
  return feature<ConnectFeature>(wallet, StandardConnect, "connect");
}

export function getEvents(wallet: Wallet): EventsFeature | null {
  return feature<EventsFeature>(wallet, StandardEvents, "on");
}

export function getSignMessage(wallet: Wallet): SignMessageFeature | null {
  return feature<SignMessageFeature>(wallet, SolanaSignMessage, "signMessage");
}

/** True when at least one of the wallet's chains is a solana: chain. */
export function hasSolanaChain(wallet: Wallet): boolean {
  return wallet.chains.some((chain) => chain.startsWith("solana:"));
}
