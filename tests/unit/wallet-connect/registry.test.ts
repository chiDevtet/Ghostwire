import { afterEach, describe, expect, it, vi } from "vitest";
import { listSolanaWallets, refreshWallets, subscribeWallets } from "@/modules/wallet-connect";
import { createFakeWallet } from "../../helpers/fake-wallet";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function registered(...args: Parameters<typeof createFakeWallet>) {
  const fake = createFakeWallet(...args);
  cleanups.push(fake.register());
  return fake;
}

function names(): string[] {
  return listSolanaWallets().map((entry) => entry.name);
}

describe("listSolanaWallets", () => {
  it("lists a Solana wallet with connect and signMessage as able to sign in", () => {
    const fake = registered({ name: "Approve" });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({
        name: "Approve",
        icon: fake.wallet.icon,
        canSignIn: true,
        wallet: fake.wallet,
      }),
    ]);
  });

  it("lists a wallet without solana:signMessage with canSignIn false", () => {
    registered({ name: "NoSign", mode: "no-signMessage" });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({ name: "NoSign", canSignIn: false }),
    ]);
  });

  it("lists a wallet with a solana: feature but no solana chain with canSignIn false", () => {
    registered({ name: "EvmChains", chains: ["eip155:1"] });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({ name: "EvmChains", canSignIn: false }),
    ]);
  });

  it("does not list a wallet with neither a solana chain nor a solana feature", () => {
    registered({ name: "EvmOnly", chains: ["eip155:1"], mode: "no-signMessage" });
    expect(listSolanaWallets()).toEqual([]);
  });

  it("puts wallets that can sign in first, then registration order", () => {
    registered({ name: "B-disabled", mode: "no-signMessage" });
    registered({ name: "C-ok" });
    registered({ name: "D-disabled", mode: "no-signMessage" });
    registered({ name: "E-ok" });
    expect(names()).toEqual(["C-ok", "E-ok", "B-disabled", "D-disabled"]);
  });

  it("keeps the same array identity until an event", () => {
    registered({ name: "One" });
    const first = listSolanaWallets();
    expect(listSolanaWallets()).toBe(first);
  });

  it("gives each wallet object a stable id", () => {
    const fake = registered({ name: "Stable" });
    const id = listSolanaWallets()[0]?.id;
    expect(id).toMatch(/^w\d+$/);
    registered({ name: "Other" });
    expect(listSolanaWallets().find((entry) => entry.wallet === fake.wallet)?.id).toBe(id);
  });
});

describe("subscribeWallets and refreshWallets", () => {
  it("notifies on a late register and the snapshot changes identity", () => {
    const before = listSolanaWallets();
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    registered({ name: "Late" });
    expect(listener).toHaveBeenCalledTimes(1);
    const after = listSolanaWallets();
    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.name)).toContain("Late");
  });

  it("notifies on unregister and removes the wallet", () => {
    const fake = createFakeWallet({ name: "Leaving" });
    const unregister = fake.register();
    expect(names()).toContain("Leaving");
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    unregister();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(names()).not.toContain("Leaving");
  });

  it("refreshWallets notifies and rebuilds the snapshot", () => {
    const before = listSolanaWallets();
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    refreshWallets();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listSolanaWallets()).not.toBe(before);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWallets(listener);
    unsubscribe();
    registered({ name: "Unheard" });
    refreshWallets();
    expect(listener).not.toHaveBeenCalled();
  });
});
