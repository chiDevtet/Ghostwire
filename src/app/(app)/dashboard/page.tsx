import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Address } from "@/ui/address";
import { Card } from "@/ui/card";
import { NetworkIndicator } from "@/ui/network-indicator";
import { loadShellState } from "../../_server/shell-state";

export const metadata: Metadata = { title: "Dashboard · GHOST WIRE" };

/** No balances and no zero values: nothing is fabricated before private balances exist. */
export default async function DashboardPage() {
  const state = await loadShellState();
  if (state.kind === "signed-out") redirect("/");
  if (state.kind === "unavailable") return <ServiceUnavailable variant="section" />;
  const { me, currentWallet } = state.viewer;
  const activeWallets = me.wallets.filter((wallet) => wallet.status === "active").length;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Dashboard</h1>
      <p className="text-lg">Your wallet is connected.</p>
      <Card title="Signed-in wallet">
        <div className="flex flex-col gap-3 text-sm">
          <Address value={currentWallet.address} copyable />
          <div>
            <NetworkIndicator network={me.session.network} />
          </div>
          <p>Linked wallets: {activeWallets}</p>
        </div>
      </Card>
      <Card title="Private balances">
        <p className="text-sm text-silver">Private balances arrive in a later release.</p>
      </Card>
    </div>
  );
}
