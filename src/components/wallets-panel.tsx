"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { unlinkWallet, type WalletItem } from "@/modules/wallet-connect";
import { Address, truncateAddress } from "@/ui/address";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DateTime } from "@/ui/date-time";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { ConnectWalletModal } from "./connect-wallet-modal";
import { panelErrorCopy } from "./panel-copy";
import { useFreshNavigation } from "./use-fresh-navigation";

export interface WalletsPanelProps {
  readonly wallets: readonly WalletItem[];
  /** The wallet the current session signed in with (server-provided). */
  readonly currentWalletId: string;
  /** The session's network; the link modal starts on it. */
  readonly network: SolanaNetwork;
}

export const UNLINK_BODY =
  "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.";

/** /settings/wallets: list, link (modal in link mode) and unlink with confirmation. */
export function WalletsPanel({ wallets, currentWalletId, network }: WalletsPanelProps) {
  const router = useRouter();
  const navigate = useFreshNavigation();
  const toast = useToast();
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState<WalletItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeConfirm = (): void => {
    setTarget(null);
    setPending(false);
    setError(null);
  };

  const confirmUnlink = async (): Promise<void> => {
    if (target === null) return;
    setPending(true);
    setError(null);
    const result = await unlinkWallet(target.id);
    if (result.ok) {
      closeConfirm();
      if (target.id === currentWalletId) {
        // The server revoked this session and cleared the cookie.
        toast.show({
          message: "You unlinked the wallet you signed in with, so you've been signed out.",
        });
        navigate("/");
      } else {
        toast.show({ message: "Wallet unlinked.", tone: "success" });
        router.refresh();
      }
      return;
    }
    if (result.code === "NOT_FOUND") {
      closeConfirm();
      router.refresh();
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      // SessionExpiredHandler shows the toast and navigates.
      closeConfirm();
      return;
    }
    setPending(false);
    setError(panelErrorCopy(result));
  };

  return (
    <section aria-labelledby="wallets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="wallets-heading" className="font-heading text-xl font-semibold">
          Wallets
        </h2>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Link another wallet
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {wallets.map((wallet) => (
          <li
            key={wallet.id}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Address</dt>
              <dd className="min-w-0">
                <Address value={wallet.address} copyable />
              </dd>
              <dt className="text-muted">Network</dt>
              <dd>
                <NetworkIndicator network={wallet.network} />
              </dd>
              <dt className="text-muted">Provider</dt>
              <dd>{wallet.provider ?? "Unknown"}</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                {wallet.status === "active" ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Unlinked</Badge>
                )}
              </dd>
              <dt className="text-muted">Linked</dt>
              <dd>
                <DateTime iso={wallet.linkedAt} />
              </dd>
            </dl>
            {wallet.status === "active" && (
              <div>
                <Button variant="secondary" onClick={() => setTarget(wallet)}>
                  Unlink
                  <span className="sr-only"> wallet {truncateAddress(wallet.address)}</span>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {linking && (
        <ConnectWalletModal
          open
          mode="link"
          initialNetwork={network}
          onClose={() => setLinking(false)}
        />
      )}
      <ConfirmDialog
        open={target !== null}
        title="Unlink this wallet?"
        body={UNLINK_BODY}
        confirmLabel="Unlink"
        pending={pending}
        error={error}
        onConfirm={() => void confirmUnlink()}
        onCancel={closeConfirm}
      />
    </section>
  );
}
