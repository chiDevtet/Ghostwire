import type { E2eKey } from "./keys";

export type TestWalletMode = "approve" | "reject" | "disconnect" | "hang";

export interface TestWalletSpec {
  readonly name: string;
  readonly icon: string;
  readonly accounts: readonly E2eKey[];
}

export interface TestWalletInit {
  readonly wallets: readonly TestWalletSpec[];
}

export interface TestWalletControl {
  /** undefined = every wallet. */
  setMode(mode: TestWalletMode, walletName?: string): void;
  /** Makes accounts[index] the only connected account and emits standard:events change. */
  switchAccount(walletName: string, index: number): void;
  signCount(walletName?: string): number;
}

/**
 * Runs in the page via page.addInitScript, which serializes this function: it must stay
 * self-contained (no imports at runtime, no outer references). Each spec becomes a Wallet
 * Standard wallet (chains solana:devnet + solana:mainnet; standard:connect, standard:events,
 * solana:signMessage 1.1.0) that signs with WebCrypto Ed25519, so the server verifies real
 * signatures. Registers through both halves of the Wallet Standard protocol and exposes
 * window.__gwTestWallet.
 */
export function installTestWallets(init: TestWalletInit): void {
  const CHAINS = ["solana:devnet", "solana:mainnet"] as const;
  interface Control {
    mode: TestWalletMode;
    signCount: number;
    switchAccount(index: number): void;
  }
  const controls = new Map<string, Control>();

  for (const spec of init.wallets) {
    const accounts = spec.accounts.map((account) =>
      Object.freeze({
        address: account.address,
        publicKey: new Uint8Array(account.publicKey),
        chains: CHAINS,
        features: ["solana:signMessage"] as const,
      }),
    );
    const keys = spec.accounts.map((account) =>
      crypto.subtle.importKey("pkcs8", new Uint8Array(account.pkcs8), { name: "Ed25519" }, false, [
        "sign",
      ]),
    );
    let connected: readonly (typeof accounts)[number][] = accounts;
    const listeners = new Set<(properties: { accounts?: readonly unknown[] }) => void>();
    const emit = (properties: { accounts?: readonly unknown[] }): void => {
      for (const listener of [...listeners]) listener(properties);
    };
    const control: Control = {
      mode: "approve",
      signCount: 0,
      switchAccount(index) {
        const account = accounts[index];
        if (account === undefined) return;
        connected = [account];
        emit({ accounts: connected });
      },
    };
    controls.set(spec.name, control);

    const wallet = {
      version: "1.0.0" as const,
      name: spec.name,
      icon: spec.icon,
      chains: CHAINS,
      get accounts() {
        return connected;
      },
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: connected }) },
        "standard:events": {
          version: "1.0.0",
          on: (
            _event: "change",
            listener: (properties: { accounts?: readonly unknown[] }) => void,
          ) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        },
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async (
            ...inputs: { account: { address: string }; message: Uint8Array }[]
          ) => {
            control.signCount += 1;
            if (control.mode === "reject") {
              throw Object.assign(new Error("User rejected the request."), { code: 4001 });
            }
            if (control.mode === "disconnect") {
              emit({ accounts: [] });
              const error = new Error("Wallet disconnected");
              error.name = "WalletDisconnectedError";
              throw error;
            }
            if (control.mode === "hang") return new Promise<never>(() => undefined);
            return Promise.all(
              inputs.map(async (input) => {
                const key = keys[accounts.findIndex((a) => a.address === input.account.address)];
                if (key === undefined) throw new Error("unknown account");
                const signature = new Uint8Array(
                  await crypto.subtle.sign(
                    { name: "Ed25519" },
                    await key,
                    new Uint8Array(input.message),
                  ),
                );
                return {
                  signedMessage: input.message,
                  signature,
                  signatureType: "ed25519" as const,
                };
              }),
            );
          },
        },
      },
    };

    const register = (api: { register: (w: unknown) => () => void }): void => {
      api.register(wallet);
    };
    window.addEventListener("wallet-standard:app-ready", (event) =>
      register((event as CustomEvent<{ register: (w: unknown) => () => void }>).detail),
    );
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  }

  const matching = (walletName?: string): Control[] =>
    [...controls]
      .filter(([name]) => walletName === undefined || name === walletName)
      .map(([, c]) => c);
  const api: TestWalletControl = {
    setMode(mode, walletName) {
      for (const control of matching(walletName)) control.mode = mode;
    },
    switchAccount(walletName, index) {
      controls.get(walletName)?.switchAccount(index);
    },
    signCount(walletName) {
      return matching(walletName).reduce((sum, control) => sum + control.signCount, 0);
    },
  };
  (window as unknown as { __gwTestWallet: TestWalletControl }).__gwTestWallet = api;
}
