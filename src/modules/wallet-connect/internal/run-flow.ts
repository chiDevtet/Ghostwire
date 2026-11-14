import type { WalletAccount } from "@wallet-standard/base";
import type { SolanaNetwork } from "@/modules/validation";
import type { ApiClient, ApiFailure } from "./api-client";
import { encodeBase58 } from "./base58";
import { parseChallengePreview } from "./challenge-preview";
import { classifyWalletError } from "./errors";
import { getConnect, getEvents, getSignMessage } from "./features";
import type { AccountOption, FlowEvent, FlowMode } from "./flow";
import { toProviderId } from "./provider-id";
import type { WalletEntry } from "./registry";

export interface FlowApi {
  readonly challenge: ApiClient["challenge"];
  readonly verify: ApiClient["verify"];
  readonly linkChallenge: ApiClient["linkChallenge"];
  readonly linkVerify: ApiClient["linkVerify"];
}

export interface RunFlowOptions {
  readonly mode: FlowMode;
  readonly entry: WalletEntry;
  readonly network: SolanaNetwork;
  readonly attemptId: number;
  /** Aborted when the modal closes or a new attempt starts. */
  readonly signal: AbortSignal;
  readonly dispatch: (event: FlowEvent) => void;
  readonly api: FlowApi;
  /** window.location.host in the browser; the challenge message's domain must equal it. */
  readonly expectedDomain: string;
  /** Skips the picker when this address is among the connected accounts (retry keeps the choice). */
  readonly preferredAddress?: string;
  /** Resolves with the chosen address; rejects with an AbortError when signal aborts. */
  readonly selectAccount: (
    accounts: readonly AccountOption[],
    signal: AbortSignal,
  ) => Promise<string>;
  /** Default Date.now; used only for retryAt. */
  readonly now?: () => number;
}

const SIGNATURE_BYTES = 64;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Rejects with an AbortError as soon as `signal` aborts, so a hung wallet never blocks cancel.
 * Handlers are always attached to `promise`, so a wallet rejection after an abort is never an
 * unhandled rejection.
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function uniqueByAddress(accounts: readonly WalletAccount[]): WalletAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    if (seen.has(account.address)) return false;
    seen.add(account.address);
    return true;
  });
}

/**
 * The sign-in / link driver: connect → pick account → challenge → signMessage → verify, as
 * reducer events. Never rejects. Dispatches only for its own attemptId and never after its
 * signal (or its internal controller, linked to it) aborted. A standard:events "change"
 * subscription runs until the signature is produced: no accounts → disconnected; the selected
 * account gone → account-changed. Both abort the attempt.
 */
export async function runFlow(options: RunFlowOptions): Promise<void> {
  const { mode, entry, network, attemptId, api } = options;
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const sig = controller.signal;
  const forwardAbort = (): void => controller.abort();
  if (options.signal.aborted) controller.abort();
  else options.signal.addEventListener("abort", forwardAbort, { once: true });

  const dispatch = (event: FlowEvent): void => {
    if (!sig.aborted) options.dispatch(event);
  };
  const apiError = (failure: ApiFailure): void => {
    const retryAt =
      failure.code === "RATE_LIMITED"
        ? now() + (failure.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000
        : undefined;
    dispatch({
      type: "api-error",
      attemptId,
      code: failure.code,
      message: failure.message,
      retryAt,
    });
  };

  let unsubscribe: (() => void) | null = null;
  const stopListening = (): void => {
    const off = unsubscribe;
    unsubscribe = null;
    off?.();
  };
  let selected: string | null = null;
  let signedYet = false;

  try {
    dispatch({ type: "start", attemptId, walletName: entry.name });

    const events = getEvents(entry.wallet);
    if (events !== null) {
      unsubscribe = events.on("change", (properties) => {
        if (signedYet || sig.aborted || properties.accounts === undefined) return;
        if (properties.accounts.length === 0) {
          dispatch({ type: "wallet-error", attemptId, kind: "disconnected" });
          controller.abort();
          return;
        }
        if (selected !== null && !properties.accounts.some((a) => a.address === selected)) {
          dispatch({ type: "account-changed", attemptId });
          controller.abort();
        }
      });
    }

    const connect = getConnect(entry.wallet);
    const signMessage = getSignMessage(entry.wallet);
    if (connect === null || signMessage === null) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }

    let connected: readonly WalletAccount[];
    try {
      connected = (await raceAbort(connect.connect(), sig)).accounts;
    } catch (error) {
      if (!sig.aborted)
        dispatch({ type: "wallet-error", attemptId, kind: classifyWalletError(error) });
      return;
    }
    const accounts = uniqueByAddress(connected.length > 0 ? connected : entry.wallet.accounts);
    if (accounts.length === 0) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }

    let address: string;
    const preferred = options.preferredAddress;
    if (preferred !== undefined && accounts.some((a) => a.address === preferred)) {
      address = preferred;
    } else if (accounts.length === 1) {
      address = (accounts[0] as WalletAccount).address;
    } else {
      const choices: AccountOption[] = accounts.map((a) => ({
        address: a.address,
        label: a.label ?? null,
      }));
      dispatch({ type: "choose-account", attemptId, accounts: choices });
      try {
        address = await raceAbort(options.selectAccount(choices, sig), sig);
      } catch {
        return;
      }
    }
    const account = accounts.find((a) => a.address === address);
    if (account === undefined) return;
    dispatch({ type: "account-selected", attemptId, address });
    selected = address;

    const issue = mode === "sign-in" ? api.challenge : api.linkChallenge;
    const challenge = await issue({ address, network }, { signal: sig });
    if (sig.aborted) return;
    if (!challenge.ok) {
      apiError(challenge);
      return;
    }
    const preview = parseChallengePreview(challenge.data.message, {
      address,
      network,
      domain: options.expectedDomain,
    });
    if (preview === null) {
      apiError({ ok: false, code: "UNEXPECTED_RESPONSE", message: "challenge mismatch" });
      return;
    }
    dispatch({ type: "challenge-issued", attemptId, preview });

    let signature: Uint8Array | undefined;
    try {
      const outputs = await raceAbort(
        signMessage.signMessage({
          account,
          message: new TextEncoder().encode(challenge.data.message),
        }),
        sig,
      );
      signature = outputs[0]?.signature;
    } catch (error) {
      if (!sig.aborted)
        dispatch({ type: "wallet-error", attemptId, kind: classifyWalletError(error) });
      return;
    }
    if (signature === undefined || signature.length !== SIGNATURE_BYTES) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }
    signedYet = true;
    stopListening();
    dispatch({ type: "signed", attemptId });

    const confirm = mode === "sign-in" ? api.verify : api.linkVerify;
    const result = await confirm(
      {
        challengeId: challenge.data.challengeId,
        signature: encodeBase58(signature),
        provider: toProviderId(entry.name),
      },
      { signal: sig },
    );
    if (sig.aborted) return;
    if (!result.ok) {
      apiError(result);
      return;
    }
    dispatch({ type: "verified", attemptId, address, network });
  } catch {
    // Never rejects; an unexpected throw is a generic wallet failure (ignored once verifying).
    dispatch({ type: "wallet-error", attemptId, kind: "other" });
  } finally {
    stopListening();
    options.signal.removeEventListener("abort", forwardAbort);
  }
}
