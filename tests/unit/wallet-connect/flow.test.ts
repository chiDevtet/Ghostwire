import { describe, expect, it } from "vitest";
import {
  initialFlowState,
  isInFlight,
  reduce,
  toFailureCode,
  type AccountOption,
  type FlowEvent,
  type FlowState,
  type FlowStatus,
} from "@/modules/wallet-connect";

const A = 1;
const ACCOUNTS: readonly AccountOption[] = [
  { address: "Addr1", label: null },
  { address: "Addr2", label: "Second" },
];
const PREVIEW = { domain: "localhost:3000", address: "Addr1", network: "devnet" } as const;

/** One state per status, all in attempt 1. Fresh objects per call so identity checks are real. */
function states(): Record<FlowStatus, FlowState> {
  return {
    idle: { status: "idle", attemptId: A },
    connecting: { status: "connecting", attemptId: A, walletName: "Fake" },
    "choosing-account": {
      status: "choosing-account",
      attemptId: A,
      walletName: "Fake",
      accounts: ACCOUNTS,
    },
    challenging: { status: "challenging", attemptId: A, address: "Addr1" },
    "awaiting-signature": { status: "awaiting-signature", attemptId: A, preview: PREVIEW },
    verifying: { status: "verifying", attemptId: A, address: "Addr1" },
    done: { status: "done", attemptId: A, address: "Addr1", network: "devnet" },
    rejected: { status: "rejected", attemptId: A },
    disconnected: { status: "disconnected", attemptId: A },
    "account-changed": { status: "account-changed", attemptId: A },
    "rate-limited": { status: "rate-limited", attemptId: A, retryAt: 5_000 },
    failed: { status: "failed", attemptId: A, code: "OTHER", message: "x" },
  };
}

type AttemptEventType = Exclude<FlowEvent["type"], "start" | "reset">;

function events(attemptId: number): Record<AttemptEventType, FlowEvent> {
  return {
    "choose-account": { type: "choose-account", attemptId, accounts: ACCOUNTS },
    "account-selected": { type: "account-selected", attemptId, address: "Addr2" },
    "challenge-issued": { type: "challenge-issued", attemptId, preview: PREVIEW },
    signed: { type: "signed", attemptId },
    verified: { type: "verified", attemptId, address: "Addr1", network: "mainnet-beta" },
    "wallet-error": { type: "wallet-error", attemptId, kind: "rejected" },
    "api-error": { type: "api-error", attemptId, code: "AUTH_FAILED", message: "m" },
    "account-changed": { type: "account-changed", attemptId },
  };
}

const STATUSES = Object.keys(states()) as FlowStatus[];
const EVENT_TYPES = Object.keys(events(A)) as AttemptEventType[];

/** The transition table's (from, event) pairs; everything else must return the same object. */
const ACCEPTED = new Set<string>([
  "connecting|choose-account",
  "connecting|account-selected",
  "choosing-account|account-selected",
  "challenging|challenge-issued",
  "awaiting-signature|signed",
  "verifying|verified",
  "connecting|wallet-error",
  "choosing-account|wallet-error",
  "challenging|wallet-error",
  "awaiting-signature|wallet-error",
  "challenging|api-error",
  "verifying|api-error",
  "choosing-account|account-changed",
  "challenging|account-changed",
  "awaiting-signature|account-changed",
]);

describe("reduce: transition table rows", () => {
  it.each<{ from: FlowStatus; event: FlowEvent; to: FlowState }>([
    {
      from: "connecting",
      event: { type: "choose-account", attemptId: A, accounts: ACCOUNTS },
      to: { status: "choosing-account", attemptId: A, walletName: "Fake", accounts: ACCOUNTS },
    },
    {
      from: "connecting",
      event: { type: "choose-account", attemptId: A, accounts: [ACCOUNTS[0] as AccountOption] },
      to: { status: "failed", attemptId: A, code: "OTHER", message: "no accounts" },
    },
    {
      from: "connecting",
      event: { type: "account-selected", attemptId: A, address: "Addr9" },
      to: { status: "challenging", attemptId: A, address: "Addr9" },
    },
    {
      from: "choosing-account",
      event: { type: "account-selected", attemptId: A, address: "Addr2" },
      to: { status: "challenging", attemptId: A, address: "Addr2" },
    },
    {
      from: "challenging",
      event: { type: "challenge-issued", attemptId: A, preview: PREVIEW },
      to: { status: "awaiting-signature", attemptId: A, preview: PREVIEW },
    },
    {
      from: "awaiting-signature",
      event: { type: "signed", attemptId: A },
      to: { status: "verifying", attemptId: A, address: "Addr1" },
    },
    {
      from: "verifying",
      event: { type: "verified", attemptId: A, address: "Addr1", network: "mainnet-beta" },
      to: { status: "done", attemptId: A, address: "Addr1", network: "mainnet-beta" },
    },
    ...(["connecting", "choosing-account", "challenging", "awaiting-signature"] as const).flatMap(
      (from) => [
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "rejected" } as const,
          to: { status: "rejected", attemptId: A } as const,
        },
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "disconnected" } as const,
          to: { status: "disconnected", attemptId: A } as const,
        },
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "other" } as const,
          to: { status: "failed", attemptId: A, code: "OTHER", message: "wallet error" } as const,
        },
      ],
    ),
    ...(["challenging", "verifying"] as const).flatMap((from) => [
      {
        from,
        event: {
          type: "api-error",
          attemptId: A,
          code: "RATE_LIMITED",
          message: "m",
          retryAt: 9_000,
        } as const,
        to: { status: "rate-limited", attemptId: A, retryAt: 9_000 } as const,
      },
      {
        from,
        event: { type: "api-error", attemptId: A, code: "RATE_LIMITED", message: "m" } as const,
        to: { status: "failed", attemptId: A, code: "OTHER", message: "m" } as const,
      },
      {
        from,
        event: {
          type: "api-error",
          attemptId: A,
          code: "DEPENDENCY_UNAVAILABLE",
          message: "m",
        } as const,
        to: { status: "failed", attemptId: A, code: "UNREACHABLE", message: "m" } as const,
      },
    ]),
    ...(["choosing-account", "challenging", "awaiting-signature"] as const).map((from) => ({
      from,
      event: { type: "account-changed", attemptId: A } as const,
      to: { status: "account-changed", attemptId: A } as const,
    })),
  ])("$from + $event.type → $to.status", ({ from, event, to }) => {
    expect(reduce(states()[from], event)).toEqual(to);
  });

  it("ignores an account-selected address that is not in the picker list", () => {
    const state = states()["choosing-account"];
    expect(reduce(state, { type: "account-selected", attemptId: A, address: "Nope" })).toBe(state);
  });

  it("ignores wallet events once verifying (a session may already be created)", () => {
    const state = states().verifying;
    expect(reduce(state, { type: "wallet-error", attemptId: A, kind: "disconnected" })).toBe(state);
    expect(reduce(state, { type: "account-changed", attemptId: A })).toBe(state);
  });
});

describe("reduce: every pair outside the table returns the same object", () => {
  const pairs = STATUSES.flatMap((status) =>
    EVENT_TYPES.filter((type) => !ACCEPTED.has(`${status}|${type}`)).map((type) => ({
      status,
      type,
    })),
  );

  it("has a non-trivial matrix (control)", () => {
    expect(pairs.length).toBe(STATUSES.length * EVENT_TYPES.length - ACCEPTED.size);
    expect(pairs.length).toBeGreaterThan(70);
  });

  it.each(pairs)("$status + $type", ({ status, type }) => {
    const state = states()[status];
    expect(reduce(state, events(A)[type])).toBe(state);
  });
});

describe("reduce: stale attempts", () => {
  const accepted = [...ACCEPTED].map((key) => {
    const [status, type] = key.split("|") as [FlowStatus, AttemptEventType];
    return { status, type };
  });

  it.each(accepted)("ignores $type from another attempt in $status", ({ status, type }) => {
    const state = states()[status];
    expect(reduce(state, events(A + 1)[type])).toBe(state);
    expect(reduce(state, events(A - 1)[type])).toBe(state);
  });

  it.each(STATUSES)("start with a higher id from %s begins connecting", (status) => {
    expect(reduce(states()[status], { type: "start", attemptId: 2, walletName: "W" })).toEqual({
      status: "connecting",
      attemptId: 2,
      walletName: "W",
    });
  });

  it.each(STATUSES)("start with an equal or lower id is ignored in %s", (status) => {
    const state = states()[status];
    expect(reduce(state, { type: "start", attemptId: A, walletName: "W" })).toBe(state);
    expect(reduce(state, { type: "start", attemptId: 0, walletName: "W" })).toBe(state);
  });

  it.each(STATUSES)("reset from %s returns idle with the same attemptId", (status) => {
    expect(reduce(states()[status], { type: "reset" })).toEqual({ status: "idle", attemptId: A });
  });
});

describe("initialFlowState, isInFlight, toFailureCode", () => {
  it("starts idle at attempt 0", () => {
    expect(initialFlowState).toEqual({ status: "idle", attemptId: 0 });
  });

  it("is in flight only while a request or wallet prompt is pending", () => {
    const inFlight = STATUSES.filter((status) => isInFlight(states()[status]));
    expect(inFlight).toEqual([
      "connecting",
      "choosing-account",
      "challenging",
      "awaiting-signature",
      "verifying",
    ]);
  });

  it.each([
    ["AUTH_FAILED", "AUTH_FAILED"],
    ["WALLET_ALREADY_LINKED", "WALLET_ALREADY_LINKED"],
    ["NETWORK_UNSUPPORTED", "NETWORK_UNSUPPORTED"],
    ["DEPENDENCY_UNAVAILABLE", "UNREACHABLE"],
    ["NETWORK", "UNREACHABLE"],
    ["INTERNAL", "OTHER"],
    ["UNEXPECTED_RESPONSE", "OTHER"],
    ["VALIDATION_FAILED", "OTHER"],
    ["", "OTHER"],
  ])("maps %s to %s", (code, expected) => {
    expect(toFailureCode(code)).toBe(expected);
  });
});
