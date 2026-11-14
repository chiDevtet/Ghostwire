"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { logout } from "@/modules/wallet-connect";
import { GhostLogo } from "@/ui/ghost-logo";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { WalletStatus } from "@/ui/wallet-status";
import { ConnectWalletModal } from "../connect-wallet-modal";
import { panelErrorCopy } from "../panel-copy";
import { useFreshNavigation } from "../use-fresh-navigation";
import type { ShellViewer } from "./app-shell";

/**
 * Wordmark, network indicator, Settings link and the wallet menu. Switch network opens the
 * connect modal in sign-in mode on the other network; the server replaces the old session.
 */
export function TopBar({ viewer }: { readonly viewer: ShellViewer }) {
  const toast = useToast();
  const navigate = useFreshNavigation();
  const [switching, setSwitching] = useState(false);
  const other: SolanaNetwork = viewer.network === "devnet" ? "mainnet-beta" : "devnet";

  const copyAddress = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(viewer.address);
      toast.show({ message: "Address copied" });
    } catch {
      toast.show({ message: "Couldn't copy the address", tone: "error" });
    }
  };

  const signOut = async (): Promise<void> => {
    const result = await logout();
    if (result.ok) {
      toast.show({ message: "You're signed out." });
      navigate("/");
    } else if (result.code !== "UNAUTHENTICATED") {
      toast.show({ message: panelErrorCopy(result), tone: "error" });
    }
  };

  return (
    <header className="border-b border-border bg-obsidian">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center">
            <GhostLogo />
          </Link>
          <NetworkIndicator network={viewer.network} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/wallets"
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm text-text hover:bg-elevated"
          >
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Link>
          <WalletStatus
            address={viewer.address}
            network={viewer.network}
            onCopyAddress={() => void copyAddress()}
            onSwitchNetwork={() => setSwitching(true)}
            onSignOut={() => void signOut()}
          />
        </div>
      </div>
      {switching && (
        <ConnectWalletModal
          open
          mode="sign-in"
          initialNetwork={other}
          onClose={() => setSwitching(false)}
        />
      )}
    </header>
  );
}
