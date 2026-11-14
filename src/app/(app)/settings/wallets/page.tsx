import type { Metadata } from "next";
import { WalletsPanel } from "@/components/wallets-panel";
import { loadShellState } from "../../../_server/shell-state";

export const metadata: Metadata = { title: "Wallets · GHOST WIRE" };

export default async function WalletsPage() {
  const state = await loadShellState();
  if (state.kind !== "signed-in") return null;
  const { me, currentWallet } = state.viewer;
  return (
    <WalletsPanel
      wallets={me.wallets}
      currentWalletId={currentWallet.id}
      network={me.session.network}
    />
  );
}
