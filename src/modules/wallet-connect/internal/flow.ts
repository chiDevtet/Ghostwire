import type { SolanaNetwork } from "@/modules/validation";

export type FlowMode = "sign-in" | "link";

export interface AccountOption {
  readonly address: string;
  readonly label: string | null;
}

export interface SignPreview {
  readonly domain: string;
  readonly address: string;
  readonly network: SolanaNetwork;
}

export type FlowFailureCode =
  "AUTH_FAILED" | "WALLET_ALREADY_LINKED" | "NETWORK_UNSUPPORTED" | "UNREACHABLE" | "OTHER";

interface Base {
  readonly attemptId: number;
}

export type FlowState =
  | (Base & { readonly status: "idle" })
  | (Base & { readonly status: "connecting"; readonly walletName: string })
  | (Base & {
      readonly status: "choosing-account";
      readonly walletName: string;
      readonly accounts: readonly AccountOption[];
    })
  | (Base & { readonly status: "challenging"; readonly address: string })
  | (Base & { readonly status: "awaiting-signature"; readonly preview: SignPreview })
  | (Base & { readonly status: "verifying"; readonly address: string })
  | (Base & { readonly status: "done"; readonly address: string; readonly network: SolanaNetwork })
  | (Base & { readonly status: "rejected" })
  | (Base & { readonly status: "disconnected" })
  | (Base & { readonly status: "account-changed" })
  /** retryAt is epoch milliseconds. */
  | (Base & { readonly status: "rate-limited"; readonly retryAt: number })
  | (Base & {
      readonly status: "failed";
      readonly code: FlowFailureCode;
      readonly message: string;
    });

export type FlowStatus = FlowState["status"];

export type FlowEvent =
  | { readonly type: "start"; readonly attemptId: number; readonly walletName: string }
  | {
      readonly type: "choose-account";
      readonly attemptId: number;
      readonly accounts: readonly AccountOption[];
    }
  | { readonly type: "account-selected"; readonly attemptId: number; readonly address: string }
  | { readonly type: "challenge-issued"; readonly attemptId: number; readonly preview: SignPreview }
  | { readonly type: "signed"; readonly attemptId: number }
  | {
      readonly type: "verified";
      readonly attemptId: number;
      readonly address: string;
      readonly network: SolanaNetwork;
    }
  | {
      readonly type: "wallet-error";
      readonly attemptId: number;
      readonly kind: "rejected" | "disconnected" | "other";
    }
  | {
      readonly type: "api-error";
      readonly attemptId: number;
      readonly code: string;
      readonly message: string;
      readonly retryAt?: number;
    }
  | { readonly type: "account-changed"; readonly attemptId: number }
  | { readonly type: "reset" };

export const initialFlowState: FlowState = { status: "idle", attemptId: 0 };

const IN_FLIGHT: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "connecting",
  "choosing-account",
  "challenging",
  "awaiting-signature",
  "verifying",
]);
/** Wallet events are not accepted in verifying: the server may already be creating the session. */
const WALLET_ERROR_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "connecting",
  "choosing-account",
  "challenging",
  "awaiting-signature",
]);
const API_ERROR_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>(["challenging", "verifying"]);
const ACCOUNT_CHANGED_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "choosing-account",
  "challenging",
  "awaiting-signature",
]);

/** connecting | choosing-account | challenging | awaiting-signature | verifying */
export function isInFlight(state: FlowState): boolean {
  return IN_FLIGHT.has(state.status);
}

/**
 * AUTH_FAILED, WALLET_ALREADY_LINKED and NETWORK_UNSUPPORTED are kept; DEPENDENCY_UNAVAILABLE
 * and NETWORK become UNREACHABLE; anything else is OTHER.
 */
export function toFailureCode(apiCode: string): FlowFailureCode {
  switch (apiCode) {
    case "AUTH_FAILED":
    case "WALLET_ALREADY_LINKED":
    case "NETWORK_UNSUPPORTED":
      return apiCode;
    case "DEPENDENCY_UNAVAILABLE":
    case "NETWORK":
      return "UNREACHABLE";
    default:
      return "OTHER";
  }
}

/**
 * Pure and total. Every (state, event) pair outside the architecture §3.1.4 transition table
 * returns the SAME state object. Events other than start and reset from another attempt are
 * ignored; start is accepted only with a strictly higher attemptId.
 */
export function reduce(state: FlowState, event: FlowEvent): FlowState {
  if (event.type === "reset") return { status: "idle", attemptId: state.attemptId };
  if (event.type === "start") {
    if (event.attemptId <= state.attemptId) return state;
    return { status: "connecting", attemptId: event.attemptId, walletName: event.walletName };
  }
  if (event.attemptId !== state.attemptId) return state;
  const attemptId = state.attemptId;
  switch (event.type) {
    case "choose-account":
      if (state.status !== "connecting") return state;
      if (event.accounts.length < 2) {
        return { status: "failed", attemptId, code: "OTHER", message: "no accounts" };
      }
      return {
        status: "choosing-account",
        attemptId,
        walletName: state.walletName,
        accounts: event.accounts,
      };
    case "account-selected":
      if (state.status === "connecting") {
        return { status: "challenging", attemptId, address: event.address };
      }
      if (
        state.status === "choosing-account" &&
        state.accounts.some((account) => account.address === event.address)
      ) {
        return { status: "challenging", attemptId, address: event.address };
      }
      return state;
    case "challenge-issued":
      if (state.status !== "challenging") return state;
      return { status: "awaiting-signature", attemptId, preview: event.preview };
    case "signed":
      if (state.status !== "awaiting-signature") return state;
      return { status: "verifying", attemptId, address: state.preview.address };
    case "verified":
      if (state.status !== "verifying") return state;
      return { status: "done", attemptId, address: event.address, network: event.network };
    case "wallet-error":
      if (!WALLET_ERROR_FROM.has(state.status)) return state;
      if (event.kind === "rejected") return { status: "rejected", attemptId };
      if (event.kind === "disconnected") return { status: "disconnected", attemptId };
      return { status: "failed", attemptId, code: "OTHER", message: "wallet error" };
    case "api-error":
      if (!API_ERROR_FROM.has(state.status)) return state;
      if (event.code === "RATE_LIMITED" && event.retryAt !== undefined) {
        return { status: "rate-limited", attemptId, retryAt: event.retryAt };
      }
      return {
        status: "failed",
        attemptId,
        code: toFailureCode(event.code),
        message: event.message,
      };
    case "account-changed":
      if (!ACCOUNT_CHANGED_FROM.has(state.status)) return state;
      return { status: "account-changed", attemptId };
  }
}
