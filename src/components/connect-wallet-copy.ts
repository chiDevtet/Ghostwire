import type { FlowFailureCode, FlowMode, FlowState } from "@/modules/wallet-connect";
import { GENERIC, UNREACHABLE } from "./panel-copy";

export type FlowAction = "retry" | "reconnect" | "start-again" | "close";

export interface FlowCopy {
  readonly message: string;
  readonly tone: "info" | "success" | "error";
  readonly action: FlowAction | null;
}

export const MAINNET_NOTE =
  "Private payments aren't available on mainnet yet. Signing in only links your wallet.";
export const NO_WALLET_SIGN_IN = "This wallet can't sign in to GHOST WIRE.";

export const ACTION_LABELS: Readonly<Record<FlowAction, string>> = {
  retry: "Try again",
  reconnect: "Reconnect",
  "start-again": "Start again",
  close: "Close",
};

function failureMessage(code: FlowFailureCode, link: boolean): string {
  switch (code) {
    case "AUTH_FAILED":
      return link
        ? "We couldn't verify that signature. Try again."
        : "We couldn't verify that signature. Request a new sign-in.";
    case "WALLET_ALREADY_LINKED":
      return "That wallet is linked to another GHOST WIRE account.";
    case "NETWORK_UNSUPPORTED":
      return "That network isn't available right now.";
    case "UNREACHABLE":
      return UNREACHABLE;
    case "OTHER":
      return GENERIC;
  }
}

const info = (message: string): FlowCopy => ({ message, tone: "info", action: null });
const error = (message: string, action: FlowAction): FlowCopy => ({
  message,
  tone: "error",
  action,
});

/**
 * The modal's status copy (spec §5.2, architecture §3.4 with the link-mode wording). null for
 * idle and choosing-account. Never mentions privacy being set up, and never shows a raw code.
 */
export function flowCopy(
  state: FlowState,
  context: { readonly mode: FlowMode; readonly walletName: string; readonly secondsLeft: number },
): FlowCopy | null {
  const link = context.mode === "link";
  switch (state.status) {
    case "idle":
    case "choosing-account":
      return null;
    case "connecting":
      return info(`Connecting to ${context.walletName}…`);
    case "challenging":
      return info(link ? "Preparing your request…" : "Preparing your sign-in…");
    case "awaiting-signature":
      return info(
        link
          ? "Approve the link request in your wallet."
          : "Approve the sign-in request in your wallet.",
      );
    case "verifying":
      return info("Verifying…");
    case "done":
      return link
        ? { message: "Wallet linked.", tone: "success", action: "close" }
        : { message: "Your wallet is connected.", tone: "success", action: null };
    case "rejected":
      return error(link ? "You cancelled the request." : "You cancelled the sign-in.", "retry");
    case "disconnected":
      return error("Your wallet disconnected.", "reconnect");
    case "account-changed":
      return error(
        "Your wallet switched accounts. Start again with the new account.",
        "start-again",
      );
    case "rate-limited":
      return error(
        context.secondsLeft > 0
          ? `Too many attempts. Try again in ${context.secondsLeft}s.`
          : "You can try again now.",
        "retry",
      );
    case "failed":
      return error(failureMessage(state.code, link), "retry");
  }
}
