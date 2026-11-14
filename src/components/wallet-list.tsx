"use client";

import { RefreshCw } from "lucide-react";
import { useId } from "react";
import { refreshWallets, type WalletEntry } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
import { NO_WALLET_SIGN_IN } from "./connect-wallet-copy";

const INSTALL_LINKS = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
] as const;

/** The modal's wallet buttons, or install links and Refresh when no Solana wallet is found. */
export function WalletList({
  wallets,
  disabled,
  onPick,
}: {
  readonly wallets: readonly WalletEntry[];
  readonly disabled: boolean;
  readonly onPick: (entry: WalletEntry) => void;
}) {
  const noteId = useId();
  if (wallets.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">No Solana wallet found in this browser.</p>
        <ul className="flex flex-col gap-2">
          {INSTALL_LINKS.map((link) => (
            <li key={link.name}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-violet underline underline-offset-4"
              >
                Get {link.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={refreshWallets}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Wallets">
      {wallets.map((entry) => {
        const descriptionId = `${noteId}-${entry.id}`;
        return (
          <li key={entry.id} className="flex flex-col gap-1">
            <button
              type="button"
              disabled={disabled || !entry.canSignIn}
              aria-describedby={entry.canSignIn ? undefined : descriptionId}
              onClick={() => onPick(entry)}
              className="flex min-h-11 w-full items-center gap-3 rounded-control border border-muted px-3 text-left text-sm font-medium text-text hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs */}
              <img src={entry.icon} alt="" width={24} height={24} className="size-6" />
              {entry.name}
            </button>
            {!entry.canSignIn && (
              <p id={descriptionId} className="text-xs text-muted">
                {NO_WALLET_SIGN_IN}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
