import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { apiClient } from "./api-client";
import { initialFlowState, reduce, type FlowMode, type FlowState } from "./flow";
import { runFlow, type FlowApi } from "./run-flow";
import type { WalletEntry } from "./registry";

export interface StartOptions {
  readonly preferredAddress?: string;
}

export interface ConnectFlow {
  readonly state: FlowState;
  /** Aborts any running attempt, then starts attemptId = previous + 1. */
  start(entry: WalletEntry, network: SolanaNetwork, options?: StartOptions): void;
  /** Resolves the pending account choice; the driver then dispatches account-selected. */
  chooseAccount(address: string): void;
  /** Aborts the running attempt and dispatches reset. Called when the modal closes. */
  cancel(): void;
}

interface PendingChoice {
  readonly resolve: (address: string) => void;
  readonly reject: (error: unknown) => void;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Reducer + driver + abort handling + account picker. Unmount aborts the running attempt. */
export function useConnectFlow(options: {
  readonly mode: FlowMode;
  readonly api?: FlowApi;
}): ConnectFlow {
  const { mode } = options;
  const api = options.api ?? apiClient;
  const [state, dispatch] = useReducer(reduce, initialFlowState);
  const attemptCounter = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<PendingChoice | null>(null);

  const abortCurrent = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    pending.current?.reject(abortError());
    pending.current = null;
  }, []);

  const start = useCallback(
    (entry: WalletEntry, network: SolanaNetwork, startOptions: StartOptions = {}) => {
      abortCurrent();
      attemptCounter.current += 1;
      const next = new AbortController();
      controller.current = next;
      void runFlow({
        mode,
        entry,
        network,
        attemptId: attemptCounter.current,
        signal: next.signal,
        dispatch,
        api,
        expectedDomain: window.location.host,
        preferredAddress: startOptions.preferredAddress,
        selectAccount: (_accounts, signal) =>
          new Promise<string>((resolve, reject) => {
            pending.current = { resolve, reject };
            signal.addEventListener("abort", () => reject(abortError()), { once: true });
          }),
      });
    },
    [abortCurrent, api, mode],
  );

  const chooseAccount = useCallback((address: string) => {
    const choice = pending.current;
    pending.current = null;
    choice?.resolve(address);
  }, []);

  const cancel = useCallback(() => {
    abortCurrent();
    dispatch({ type: "reset" });
  }, [abortCurrent]);

  useEffect(() => abortCurrent, [abortCurrent]);

  return useMemo(
    () => ({ state, start, chooseAccount, cancel }),
    [state, start, chooseAccount, cancel],
  );
}
