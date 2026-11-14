"use client";

import type { SolanaNetwork } from "@/modules/validation";
import { truncateAddress } from "./address";
import { MenuButton } from "./menu";
import { networkLabel } from "./network-indicator";

export interface WalletStatusProps {
  readonly address: string;
  readonly network: SolanaNetwork;
  readonly onCopyAddress: () => void;
  readonly onSwitchNetwork: () => void;
  readonly onSignOut: () => void;
}

/**
 * The top bar's wallet menu. The button reads "Wallet menu AbCd…WxYz" (visible text inside the
 * name); its items are Copy address, Switch to {other network} and Sign out.
 */
export function WalletStatus({
  address,
  network,
  onCopyAddress,
  onSwitchNetwork,
  onSignOut,
}: WalletStatusProps) {
  const other: SolanaNetwork = network === "devnet" ? "mainnet-beta" : "devnet";
  return (
    <MenuButton
      label={<span className="font-mono">{truncateAddress(address)}</span>}
      accessibleLabel="Wallet menu"
      items={[
        { id: "copy", label: "Copy address", onSelect: onCopyAddress },
        { id: "switch", label: `Switch to ${networkLabel(other)}`, onSelect: onSwitchNetwork },
        { id: "sign-out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
      ]}
    />
  );
}
