import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { WalletsPanel } from "@/components/wallets-panel";
import { loadShellState } from "../../../_server/shell-state";

export const metadata: Metadata = { title: "Wallets · GHOST WIRE" };

export default async function WalletsPage() {
  const state = await loadShellState();
  if (state.kind === "signed-out") redirect("/");
  if (state.kind === "unavailable") return <ServiceUnavailable variant="section" />;
  const { me, currentWallet } = state.viewer;
  return (
    <WalletsPanel
      wallets={me.wallets}
      currentWalletId={currentWallet.id}
      network={me.session.network}
    />
  );
}
