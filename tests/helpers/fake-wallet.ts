import { SolanaSignMessage, type SolanaSignMessageInput } from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type { IdentifierString, Wallet, WalletAccount, WalletIcon } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardEvents,
  type StandardEventsChangeProperties,
} from "@wallet-standard/features";
import { createTestWallet, type TestWallet } from "./ed25519";

export type FakeWalletMode =
  "approve" | "reject" | "disconnect" | "switch-account" | "hang" | "no-signMessage";
export type RejectionShape = "standard-4001" | "phantom" | "solflare" | "wrapped";

export interface FakeWalletOptions {
  /** Default "Fake Wallet". */
  readonly name?: string;
  /** Default "approve". */
  readonly mode?: FakeWalletMode;
  /** Default 1 (2 or more exercises the account picker). */
  readonly accountCount?: number;
  /** Default ["solana:devnet", "solana:mainnet"]. */
  readonly chains?: readonly IdentifierString[];
  /** Which step reject/disconnect apply to. Default "sign". */
  readonly rejectOn?: "connect" | "sign";
  /** Default "standard-4001". */
  readonly rejectionShape?: RejectionShape;
}

export interface FakeWallet {
  readonly wallet: Wallet;
  /** keys[i].address is account i. */
  readonly keys: readonly TestWallet[];
  setMode(mode: FakeWalletMode): void;
  readonly calls: { readonly connect: number; readonly signMessage: number };
  /** Calls every standard:events "change" listener. */
  emitChange(properties: StandardEventsChangeProperties): void;
  /** getWallets().register(wallet); returns unregister (call it in afterEach). */
  register(): () => void;
}

const ICON: WalletIcon = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#A78BFA"/></svg>',
)}`;

function rejection(shape: RejectionShape): unknown {
  switch (shape) {
    case "standard-4001":
      return Object.assign(new Error("User rejected the request."), { code: 4001 });
    case "phantom":
      return { code: 4001, message: "User rejected the request." };
    case "solflare": {
      const error = new Error("User rejected the request");
      error.name = "WalletSignMessageError";
      return error;
    }
    case "wrapped":
      return { name: "WalletSignMessageError", error: { code: 4001 } };
  }
}

function disconnectedError(): Error {
  const error = new Error("Wallet disconnected");
  error.name = "WalletDisconnectedError";
  return error;
}

function toAccount(key: TestWallet, chains: readonly IdentifierString[]): WalletAccount {
  return Object.freeze({
    address: key.address,
    publicKey: key.publicKey,
    chains,
    features: [SolanaSignMessage] as const,
  });
}

/**
 * An in-memory Wallet Standard wallet with scripted modes. It signs with real Ed25519 keys
 * (tests/helpers/ed25519.ts), so its signatures verify like a real wallet's.
 */
export function createFakeWallet(options: FakeWalletOptions = {}): FakeWallet {
  const chains = options.chains ?? ["solana:devnet", "solana:mainnet"];
  const rejectOn = options.rejectOn ?? "sign";
  const shape = options.rejectionShape ?? "standard-4001";
  const keys = Array.from({ length: options.accountCount ?? 1 }, () => createTestWallet());
  let accounts: readonly WalletAccount[] = keys.map((key) => toAccount(key, chains));
  let mode: FakeWalletMode = options.mode ?? "approve";
  const calls = { connect: 0, signMessage: 0 };
  const listeners = new Set<(properties: StandardEventsChangeProperties) => void>();

  const emitChange = (properties: StandardEventsChangeProperties): void => {
    for (const listener of [...listeners]) listener(properties);
  };

  const failStep = async (step: "connect" | "sign"): Promise<void> => {
    if (rejectOn !== step) return;
    if (mode === "reject") throw rejection(shape);
    if (mode === "disconnect") {
      emitChange({ accounts: [] });
      throw disconnectedError();
    }
  };

  const connectFeature = {
    version: "1.0.0" as const,
    connect: async () => {
      calls.connect += 1;
      await failStep("connect");
      return { accounts };
    },
  };
  const eventsFeature = {
    version: "1.0.0" as const,
    on: (_event: "change", listener: (properties: StandardEventsChangeProperties) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const signMessageFeature = {
    version: "1.1.0" as const,
    signMessage: async (...inputs: readonly SolanaSignMessageInput[]) => {
      calls.signMessage += 1;
      await failStep("sign");
      if (mode === "hang") return new Promise<never>(() => undefined);
      if (mode === "switch-account") {
        accounts = [toAccount(createTestWallet(), chains)];
        emitChange({ accounts });
        return new Promise<never>(() => undefined);
      }
      return inputs.map((input) => {
        const key = keys.find((k) => k.address === input.account.address);
        if (key === undefined) throw new Error("unknown account");
        return {
          signedMessage: input.message,
          signature: key.signBytes(input.message),
          signatureType: "ed25519" as const,
        };
      });
    },
  };

  const wallet: Wallet = {
    version: "1.0.0",
    name: options.name ?? "Fake Wallet",
    icon: ICON,
    chains,
    get accounts() {
      return accounts;
    },
    get features() {
      const base = { [StandardConnect]: connectFeature, [StandardEvents]: eventsFeature };
      return mode === "no-signMessage"
        ? base
        : { ...base, [SolanaSignMessage]: signMessageFeature };
    },
  };

  return {
    wallet,
    keys,
    setMode: (next) => {
      mode = next;
    },
    calls,
    emitChange,
    register: () => getWallets().register(wallet),
  };
}
