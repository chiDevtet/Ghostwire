"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import {
  isInFlight,
  useConnectFlow,
  useWallets,
  type FlowApi,
  type FlowMode,
  type WalletEntry,
} from "@/modules/wallet-connect";
import { Dialog } from "@/ui/dialog";
import { SegmentedControl } from "@/ui/segmented-control";
import { AccountPicker } from "./account-picker";
import { MAINNET_NOTE, type FlowAction } from "./connect-wallet-copy";
import { FlowStatus } from "./flow-status";
import { useFreshNavigation } from "./use-fresh-navigation";
import { WalletList } from "./wallet-list";

export interface ConnectWalletModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mode: FlowMode;
  /** Default "devnet". */
  readonly initialNetwork?: SolanaNetwork;
  /** Tests may inject; default apiClient. */
  readonly api?: FlowApi;
}

const NETWORK_OPTIONS = [
  { value: "devnet", label: "Devnet" },
  { value: "mainnet-beta", label: "Mainnet-beta" },
] as const satisfies readonly { value: SolanaNetwork; label: string }[];

/**
 * Connect-and-sign-in (or link) modal. Parents mount it only while open, so every open starts
 * idle on `initialNetwork`. Closing cancels the attempt. Sign-in success navigates to
 * /dashboard; link success shows "Wallet linked." and refreshes the server data.
 */
export function ConnectWalletModal({
  open,
  onClose,
  mode,
  initialNetwork = "devnet",
  api,
}: ConnectWalletModalProps) {
  const flow = useConnectFlow({ mode, api });
  const { state } = flow;
  const wallets = useWallets();
  const router = useRouter();
  const navigate = useFreshNavigation();
  const [network, setNetwork] = useState<SolanaNetwork>(initialNetwork);
  const [last, setLast] = useState<WalletEntry | null>(null);
  const lastAddress = useRef<string | undefined>(undefined);
  const handledDone = useRef(0);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (state.status === "challenging" || state.status === "verifying") {
      lastAddress.current = state.address;
    }
    if (state.status !== "done" || handledDone.current === state.attemptId) return;
    handledDone.current = state.attemptId;
    if (mode === "sign-in") {
      navigate("/dashboard");
      onCloseRef.current();
    } else {
      router.refresh();
    }
  }, [state, mode, navigate, router]);

  const close = (): void => {
    const wasVerifying = state.status === "verifying";
    flow.cancel();
    // The server may already have created a session (or revoked the old one) for a verify we abandoned.
    if (wasVerifying) router.refresh();
    onClose();
  };

  const pick = (entry: WalletEntry): void => {
    setLast(entry);
    lastAddress.current = undefined;
    flow.start(entry, network);
  };

  const onAction = (action: FlowAction): void => {
    if (action === "close") {
      close();
      return;
    }
    if (last === null) return;
    if (action === "start-again") lastAddress.current = undefined;
    flow.start(last, network, { preferredAddress: lastAddress.current });
  };

  const inFlight = isInFlight(state);
  const showList = state.status === "idle" || (!inFlight && state.status !== "done");

  return (
    <Dialog
      open={open}
      onClose={close}
      title={mode === "sign-in" ? "Connect a wallet" : "Link another wallet"}
    >
      <SegmentedControl
        legend="Network"
        name="network"
        value={network}
        options={NETWORK_OPTIONS}
        onChange={setNetwork}
        disabled={inFlight}
      />
      {network === "mainnet-beta" && <p className="text-sm text-silver">{MAINNET_NOTE}</p>}
      {showList && <WalletList wallets={wallets} disabled={inFlight} onPick={pick} />}
      {state.status === "choosing-account" && (
        <AccountPicker accounts={state.accounts} onChoose={flow.chooseAccount} />
      )}
      <FlowStatus
        state={state}
        mode={mode}
        walletName={state.status === "connecting" ? state.walletName : (last?.name ?? "")}
        onAction={onAction}
      />
    </Dialog>
  );
}
