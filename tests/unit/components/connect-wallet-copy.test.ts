import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  MAINNET_NOTE,
  NO_WALLET_SIGN_IN,
  flowCopy,
  type FlowCopy,
} from "@/components/connect-wallet-copy";
import type { FlowFailureCode, FlowState } from "@/modules/wallet-connect";

const A = { attemptId: 1 } as const;
const PREVIEW = { domain: "localhost:3000", address: "Addr1", network: "devnet" } as const;
const failed = (code: FlowFailureCode): FlowState => ({
  ...A,
  status: "failed",
  code,
  message: "m",
});

/** [label, state, sign-in copy, link copy] — architecture §3.4, exact strings. */
const ROWS: readonly [string, FlowState, FlowCopy, FlowCopy][] = [
  [
    "connecting",
    { ...A, status: "connecting", walletName: "Phantom" },
    { message: "Connecting to Phantom…", tone: "info", action: null },
    { message: "Connecting to Phantom…", tone: "info", action: null },
  ],
  [
    "challenging",
    { ...A, status: "challenging", address: "Addr1" },
    { message: "Preparing your sign-in…", tone: "info", action: null },
    { message: "Preparing your request…", tone: "info", action: null },
  ],
  [
    "awaiting-signature",
    { ...A, status: "awaiting-signature", preview: PREVIEW },
    { message: "Approve the sign-in request in your wallet.", tone: "info", action: null },
    { message: "Approve the link request in your wallet.", tone: "info", action: null },
  ],
  [
    "verifying",
    { ...A, status: "verifying", address: "Addr1" },
    { message: "Verifying…", tone: "info", action: null },
    { message: "Verifying…", tone: "info", action: null },
  ],
  [
    "done",
    { ...A, status: "done", address: "Addr1", network: "devnet" },
    { message: "Your wallet is connected.", tone: "success", action: null },
    { message: "Wallet linked.", tone: "success", action: "close" },
  ],
  [
    "rejected",
    { ...A, status: "rejected" },
    { message: "You cancelled the sign-in.", tone: "error", action: "retry" },
    { message: "You cancelled the request.", tone: "error", action: "retry" },
  ],
  [
    "disconnected",
    { ...A, status: "disconnected" },
    { message: "Your wallet disconnected.", tone: "error", action: "reconnect" },
    { message: "Your wallet disconnected.", tone: "error", action: "reconnect" },
  ],
  [
    "account-changed",
    { ...A, status: "account-changed" },
    {
      message: "Your wallet switched accounts. Start again with the new account.",
      tone: "error",
      action: "start-again",
    },
    {
      message: "Your wallet switched accounts. Start again with the new account.",
      tone: "error",
      action: "start-again",
    },
  ],
  [
    "failed AUTH_FAILED",
    failed("AUTH_FAILED"),
    {
      message: "We couldn't verify that signature. Request a new sign-in.",
      tone: "error",
      action: "retry",
    },
    { message: "We couldn't verify that signature. Try again.", tone: "error", action: "retry" },
  ],
  [
    "failed WALLET_ALREADY_LINKED",
    failed("WALLET_ALREADY_LINKED"),
    {
      message: "That wallet is linked to another GHOST WIRE account.",
      tone: "error",
      action: "retry",
    },
    {
      message: "That wallet is linked to another GHOST WIRE account.",
      tone: "error",
      action: "retry",
    },
  ],
  [
    "failed NETWORK_UNSUPPORTED",
    failed("NETWORK_UNSUPPORTED"),
    { message: "That network isn't available right now.", tone: "error", action: "retry" },
    { message: "That network isn't available right now.", tone: "error", action: "retry" },
  ],
  [
    "failed UNREACHABLE",
    failed("UNREACHABLE"),
    {
      message: "We can't reach GHOST WIRE right now. Check your connection and try again.",
      tone: "error",
      action: "retry",
    },
    {
      message: "We can't reach GHOST WIRE right now. Check your connection and try again.",
      tone: "error",
      action: "retry",
    },
  ],
  [
    "failed OTHER",
    failed("OTHER"),
    { message: "Something went wrong. Try again.", tone: "error", action: "retry" },
    { message: "Something went wrong. Try again.", tone: "error", action: "retry" },
  ],
];

describe("flowCopy", () => {
  it.each(ROWS)("%s", (_label, state, signIn, link) => {
    expect(flowCopy(state, { mode: "sign-in", walletName: "Phantom", secondsLeft: 0 })).toEqual(
      signIn,
    );
    expect(flowCopy(state, { mode: "link", walletName: "Phantom", secondsLeft: 0 })).toEqual(link);
  });

  it("counts down while rate-limited and invites a retry at 0", () => {
    const state: FlowState = { ...A, status: "rate-limited", retryAt: 0 };
    for (const mode of ["sign-in", "link"] as const) {
      expect(flowCopy(state, { mode, walletName: "W", secondsLeft: 42 })).toEqual({
        message: "Too many attempts. Try again in 42s.",
        tone: "error",
        action: "retry",
      });
      expect(flowCopy(state, { mode, walletName: "W", secondsLeft: 0 })?.message).toBe(
        "You can try again now.",
      );
    }
  });

  it("returns null for idle and choosing-account", () => {
    const context = { mode: "sign-in", walletName: "W", secondsLeft: 0 } as const;
    expect(flowCopy({ ...A, status: "idle" }, context)).toBeNull();
    expect(
      flowCopy({ ...A, status: "choosing-account", walletName: "W", accounts: [] }, context),
    ).toBeNull();
  });

  it("never claims anonymity, untraceability or initialized privacy", () => {
    const texts = [
      MAINNET_NOTE,
      NO_WALLET_SIGN_IN,
      ...Object.values(ACTION_LABELS),
      ...ROWS.flatMap(([, , signIn, link]) => [signIn.message, link.message]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/anonym|untrace|private now|privacy (is )?(on|enabled|ready)/i);
    }
  });

  it("keeps the exact mainnet note and disabled-wallet copy", () => {
    expect(MAINNET_NOTE).toBe(
      "Private payments aren't available on mainnet yet. Signing in only links your wallet.",
    );
    expect(NO_WALLET_SIGN_IN).toBe("This wallet can't sign in to GHOST WIRE.");
  });
});
