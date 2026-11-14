import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConnectFlow, type FlowApi, type WalletEntry } from "@/modules/wallet-connect";
import { challengeFor } from "../../helpers/fake-api";
import { createFakeWallet, type FakeWallet } from "../../helpers/fake-wallet";

const SIGN_IN = {
  user: { id: "a".repeat(24) },
  wallet: { id: "b".repeat(24), address: "x", network: "devnet" as const },
};

function entryFor(fake: FakeWallet): WalletEntry {
  return {
    id: fake.wallet.name,
    name: fake.wallet.name,
    icon: fake.wallet.icon,
    canSignIn: true,
    wallet: fake.wallet,
  };
}

function recordingApi() {
  const signals: AbortSignal[] = [];
  const api: FlowApi = {
    challenge: vi.fn<FlowApi["challenge"]>(async ({ address, network }, options) => {
      if (options?.signal !== undefined) signals.push(options.signal);
      return { ok: true, data: challengeFor({ address, network }) };
    }),
    linkChallenge: vi.fn<FlowApi["linkChallenge"]>(),
    verify: vi.fn<FlowApi["verify"]>(async () => ({ ok: true, data: SIGN_IN })),
    linkVerify: vi.fn<FlowApi["linkVerify"]>(),
  };
  return { api, signals };
}

describe("useConnectFlow", () => {
  it("drops the first attempt's events when start is called again", async () => {
    const { api, signals } = recordingApi();
    const hanging = createFakeWallet({ name: "Hanging", mode: "hang" });
    const approving = createFakeWallet({ name: "Approving" });
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(hanging), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    act(() => result.current.start(entryFor(approving), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.state).toMatchObject({
      attemptId: 2,
      address: approving.keys[0]?.address,
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(api.verify).toHaveBeenCalledTimes(1);
  });

  it("aborts the running attempt on unmount", async () => {
    const { api, signals } = recordingApi();
    const { result, unmount } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(createFakeWallet({ mode: "hang" })), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    expect(signals[0]?.aborted).toBe(false);
    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("resolves the account picker through chooseAccount", async () => {
    const { api } = recordingApi();
    const fake = createFakeWallet({ accountCount: 2 });
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(fake), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("choosing-account"));
    act(() => result.current.chooseAccount(fake.keys[1]?.address ?? ""));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.state).toMatchObject({ address: fake.keys[1]?.address });
  });

  it("cancel aborts and resets to idle", async () => {
    const { api, signals } = recordingApi();
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(createFakeWallet({ mode: "hang" })), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    act(() => result.current.cancel());
    expect(result.current.state).toEqual({ status: "idle", attemptId: 1 });
    expect(signals[0]?.aborted).toBe(true);
  });
});
