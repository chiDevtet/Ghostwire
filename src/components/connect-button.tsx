"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import type { FlowMode } from "@/modules/wallet-connect";
import { Button, type ButtonVariant } from "@/ui/button";

/** Loaded on first open, which keeps wallet-connect, zod/mini and bs58 off the landing page's JS. */
const ConnectWalletModal = dynamic(
  () => import("./connect-wallet-modal").then((module) => module.ConnectWalletModal),
  { ssr: false },
);

export interface ConnectButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  /** Default "sign-in". */
  readonly mode?: FlowMode;
  /** Default "devnet". */
  readonly initialNetwork?: SolanaNetwork;
}

export function ConnectButton({
  children,
  variant = "primary",
  mode = "sign-in",
  initialNetwork = "devnet",
}: ConnectButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <ConnectWalletModal
          open
          mode={mode}
          initialNetwork={initialNetwork}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
