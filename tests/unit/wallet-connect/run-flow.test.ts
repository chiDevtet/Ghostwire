import { describe, expect, it, vi } from "vitest";
import {
  runFlow,
  type FlowApi,
  type FlowEvent,
  type RunFlowOptions,
  type WalletEntry,
} from "@/modules/wallet-connect";
import { challengeFor } from "../../helpers/fake-api";
import { createFakeWallet, type FakeWallet } from "../../helpers/fake-wallet";

const DOMAIN = "localhost:3000";
const SIGN_IN = {
  user: { id: "a".repeat(24) },
  wallet: { id: "b".repeat(24), address: "x", network: "devnet" as const },
};
const LINKED = {
  wallet: {
    id: "c".repeat(24),
    address: "x",
    network: "devnet" as const,
    provider: null,
    status: "active" as const,
    linkedAt: "2026-11-13T10:00:00.000Z",
  },
  created: true,
};

function entryFor(fake: FakeWallet): WalletEntry {
  return {
    id: "w1",
    name: fake.wallet.name,
    icon: fake.wallet.icon,
    canSignIn: true,
    wallet: fake.wallet,
  };
}

function fakeApi() {
  const challenges: { challengeId: string; message: string }[] = [];
  const issue = async ({
    address,
    network,
  }: {
    address: string;
    network: "devnet" | "mainnet-beta";
  }) => {
    const data = challengeFor({ address, network });
    challenges.push(data);
    return { ok: true as const, data };
  };
  const api = {
    challenge: vi.fn<FlowApi["challenge"]>(issue),
    linkChallenge: vi.fn<FlowApi["linkChallenge"]>(issue),
    verify: vi.fn<FlowApi["verify"]>(async () => ({ ok: true as const, data: SIGN_IN })),
    linkVerify: vi.fn<FlowApi["linkVerify"]>(async () => ({ ok: true as const, data: LINKED })),
  };
  return { api, challenges };
}

function start(fake: FakeWallet, overrides: Partial<RunFlowOptions> = {}) {
  const events: FlowEvent[] = [];
  const controller = new AbortController();
  const { api, challenges } = fakeApi();
  const selectAccount = vi.fn<RunFlowOptions["selectAccount"]>(
    async (accounts) => accounts[1]?.address ?? "",
  );
  const done = runFlow({
    mode: "sign-in",
    entry: entryFor(fake),
    network: "devnet",
    attemptId: 7,
    signal: controller.signal,
    dispatch: (event) => events.push(event),
    api,
    expectedDomain: DOMAIN,
    selectAccount,
    ...overrides,
  });
  return { events, controller, api, challenges, selectAccount, done };
}

const types = (events: readonly FlowEvent[]) => events.map((event) => event.type);

describe("runFlow: happy paths", () => {
  it("signs in: connect, challenge, sign, verify with a real signature", async () => {
    const fake = createFakeWallet({ name: "Fake Wallet" });
    const { events, api, challenges, done } = start(fake);
    await done;
    expect(types(events)).toEqual([
      "start",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
    expect(events.every((event) => event.type === "reset" || event.attemptId === 7)).toBe(true);
    const address = fake.keys[0]?.address ?? "";
    expect(api.challenge).toHaveBeenCalledWith(
      { address, network: "devnet" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const challenge = challenges[0];
    expect(api.verify).toHaveBeenCalledWith(
      {
        challengeId: challenge?.challengeId,
        signature: fake.keys[0]?.sign(challenge?.message ?? ""),
        provider: "fake-wallet",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(events.at(-1)).toEqual({ type: "verified", attemptId: 7, address, network: "devnet" });
    expect(events[2]).toEqual({
      type: "challenge-issued",
      attemptId: 7,
      preview: { domain: DOMAIN, address, network: "devnet" },
    });
    expect(api.linkChallenge).not.toHaveBeenCalled();
    expect(api.linkVerify).not.toHaveBeenCalled();
  });

  it("links with the link endpoints only", async () => {
    const { events, api, done } = start(createFakeWallet(), { mode: "link" });
    await done;
    expect(types(events).at(-1)).toBe("verified");
    expect(api.linkChallenge).toHaveBeenCalledTimes(1);
    expect(api.linkVerify).toHaveBeenCalledTimes(1);
    expect(api.challenge).not.toHaveBeenCalled();
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("asks for an account when several are connected and signs with the chosen key", async () => {
    const fake = createFakeWallet({ accountCount: 2 });
    const { events, api, challenges, selectAccount, done } = start(fake);
    await done;
    expect(selectAccount).toHaveBeenCalledTimes(1);
    expect(selectAccount.mock.calls[0]?.[0].map((a) => a.address)).toEqual(
      fake.keys.map((k) => k.address),
    );
    expect(types(events)).toEqual([
      "start",
      "choose-account",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
    expect(events[2]).toMatchObject({ address: fake.keys[1]?.address });
    expect(api.verify.mock.calls[0]?.[0].signature).toBe(
      fake.keys[1]?.sign(challenges[0]?.message ?? ""),
    );
  });

  it("skips the picker for a preferredAddress among the accounts", async () => {
    const fake = createFakeWallet({ accountCount: 2 });
    const { events, selectAccount, done } = start(fake, {
      preferredAddress: fake.keys[1]?.address,
    });
    await done;
    expect(selectAccount).not.toHaveBeenCalled();
    expect(events[1]).toEqual({
      type: "account-selected",
      attemptId: 7,
      address: fake.keys[1]?.address,
    });
  });
});

describe("runFlow: wallet failures", () => {
  it("reports a rejection at connect and never requests a challenge", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "reject", rejectOn: "connect" }));
    await done;
    expect(events).toEqual([
      { type: "start", attemptId: 7, walletName: "Fake Wallet" },
      { type: "wallet-error", attemptId: 7, kind: "rejected" },
    ]);
    expect(api.challenge).not.toHaveBeenCalled();
  });

  it.each(["standard-4001", "phantom", "solflare", "wrapped"] as const)(
    "reports a %s rejection at sign and never verifies",
    async (rejectionShape) => {
      const { events, api, done } = start(createFakeWallet({ mode: "reject", rejectionShape }));
      await done;
      expect(events.at(-1)).toEqual({ type: "wallet-error", attemptId: 7, kind: "rejected" });
      expect(types(events)).not.toContain("signed");
      expect(api.verify).not.toHaveBeenCalled();
    },
  );

  it("reports a disconnect once and never verifies", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "disconnect" }));
    await done;
    expect(events.filter((event) => event.type === "wallet-error")).toEqual([
      { type: "wallet-error", attemptId: 7, kind: "disconnected" },
    ]);
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("reports account-changed when the selected account disappears, then stops", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "switch-account" }));
    await done;
    expect(events.at(-1)).toEqual({ type: "account-changed", attemptId: 7 });
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("reports a signature that is not 64 bytes as a generic wallet error", async () => {
    const fake = createFakeWallet();
    const wallet = {
      ...fake.wallet,
      accounts: fake.wallet.accounts,
      features: {
        ...fake.wallet.features,
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async (input: { message: Uint8Array }) => [
            { signedMessage: input.message, signature: new Uint8Array(63) },
          ],
        },
      },
    };
    const { events, api, done } = start(fake, { entry: { ...entryFor(fake), wallet } });
    await done;
    expect(events.at(-1)).toEqual({ type: "wallet-error", attemptId: 7, kind: "other" });
    expect(api.verify).not.toHaveBeenCalled();
  });
});

describe("runFlow: API failures", () => {
  it("turns a 429 into api-error with retryAt = now + Retry-After", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.challenge.mockResolvedValue({
      ok: false,
      code: "RATE_LIMITED",
      message: "m",
      retryAfter: 42,
    });
    const { events, done } = start(fake, { api, now: () => 1_000 });
    await done;
    expect(events.at(-1)).toEqual({
      type: "api-error",
      attemptId: 7,
      code: "RATE_LIMITED",
      message: "m",
      retryAt: 43_000,
    });
  });

  it("refuses to sign a challenge for another domain", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.challenge.mockImplementation(async ({ address, network }) => ({
      ok: true,
      data: challengeFor({ address, network, domain: "evil.test" }),
    }));
    const { events, done } = start(fake, { api });
    await done;
    expect(events.at(-1)).toMatchObject({ type: "api-error", code: "UNEXPECTED_RESPONSE" });
    expect(fake.calls.signMessage).toBe(0);
  });

  it("passes a verify failure through as api-error without retryAt", async () => {
    const { api } = fakeApi();
    api.verify.mockResolvedValue({ ok: false, code: "AUTH_FAILED", message: "m" });
    const { events, done } = start(createFakeWallet(), { api });
    await done;
    expect(events.at(-1)).toEqual({
      type: "api-error",
      attemptId: 7,
      code: "AUTH_FAILED",
      message: "m",
      retryAt: undefined,
    });
  });
});

describe("runFlow: cancellation", () => {
  it("stops a hung wallet on abort, dispatches nothing more and resolves", async () => {
    const fake = createFakeWallet({ mode: "hang" });
    const { events, api, controller, done } = start(fake);
    await vi.waitFor(() => expect(types(events)).toContain("challenge-issued"));
    const count = events.length;
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(events).toHaveLength(count);
    expect(fake.calls.signMessage).toBe(1);
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("aborts the in-flight challenge request and dispatches nothing after abort", async () => {
    const { api } = fakeApi();
    let seen: AbortSignal | undefined;
    api.challenge.mockImplementation(
      (_input, options) =>
        new Promise((resolve) => {
          seen = options?.signal;
          options?.signal?.addEventListener("abort", () =>
            resolve({ ok: false, code: "ABORTED", message: "aborted" }),
          );
        }),
    );
    const { events, controller, done } = start(createFakeWallet(), { api });
    await vi.waitFor(() => expect(seen).toBeDefined());
    controller.abort();
    await done;
    expect(seen?.aborted).toBe(true);
    expect(types(events)).toEqual(["start", "account-selected"]);
  });

  it("ignores a change event after the signature was produced", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.verify.mockImplementation(async () => {
      fake.emitChange({ accounts: [] });
      return { ok: true, data: SIGN_IN };
    });
    const { events, done } = start(fake, { api });
    await done;
    expect(types(events)).toEqual([
      "start",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
  });

  it("dispatches nothing when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, done } = start(createFakeWallet(), { signal: controller.signal });
    await done;
    expect(events).toEqual([]);
  });
});
