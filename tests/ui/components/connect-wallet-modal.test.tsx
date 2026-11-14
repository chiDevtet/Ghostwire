import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAINNET_NOTE, NO_WALLET_SIGN_IN } from "@/components/connect-wallet-copy";
import { ConnectWalletModal } from "@/components/connect-wallet-modal";
import type { SolanaNetwork } from "@/modules/validation";
import {
  challengeFor,
  json,
  mockApi,
  type ApiRouteKey,
  type FakeApi,
  type FakeHandler,
} from "../../helpers/fake-api";
import {
  createFakeWallet,
  type FakeWallet,
  type FakeWalletOptions,
} from "../../helpers/fake-wallet";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const ID = "a".repeat(24);
const SIGN_IN = { user: { id: ID }, wallet: { id: ID, address: "x", network: "devnet" } };
const WALLET = {
  id: ID,
  address: "x",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: "2026-11-13T10:00:00.000Z",
};
const never = () => new Promise<Response>(() => undefined);

const cleanups: (() => void)[] = [];
let api: FakeApi | null = null;
const challenges: string[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  api?.restore();
  api = null;
  challenges.length = 0;
  vi.useRealTimers();
});

function wallet(options: FakeWalletOptions = {}): FakeWallet {
  const fake = createFakeWallet({ name: "Fake Wallet", ...options });
  cleanups.push(fake.register());
  return fake;
}

const issue =
  (purpose: "signin" | "link"): FakeHandler =>
  async (request) => {
    const { address, network } = (await request.json()) as {
      address: string;
      network: SolanaNetwork;
    };
    const challenge = challengeFor({ address, network, purpose });
    challenges.push(challenge.message);
    return json(200, challenge);
  };

function server(overrides: Partial<Record<ApiRouteKey, FakeHandler>> = {}): FakeApi {
  api = mockApi({
    "POST /api/v1/auth/challenge": issue("signin"),
    "POST /api/v1/auth/verify": () => json(200, SIGN_IN),
    "POST /api/v1/wallets/link/challenge": issue("link"),
    "POST /api/v1/wallets/link/verify": () => json(201, { wallet: WALLET }),
    ...overrides,
  });
  return api;
}

function Harness({
  mode = "sign-in",
  initialNetwork,
}: {
  mode?: "sign-in" | "link";
  initialNetwork?: SolanaNetwork;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
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

function setup(props: Parameters<typeof Harness>[0] = {}, user = userEvent.setup()) {
  render(<Harness {...props} />);
  return user;
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const paths = () => (api?.requests ?? []).map((r) => `${r.method} ${new URL(r.url).pathname}`);

describe("network selection", () => {
  it("defaults to Devnet and shows the mainnet note only for Mainnet-beta", async () => {
    wallet();
    server();
    const user = setup();
    expect(screen.getByRole("dialog", { name: "Connect a wallet" })).toBeTruthy();
    expect(radio("Devnet").checked).toBe(true);
    expect(screen.queryByText(MAINNET_NOTE)).toBeNull();
    await user.click(radio("Mainnet-beta"));
    expect(screen.getByText(MAINNET_NOTE)).toBeTruthy();
  });

  it("preselects initialNetwork", () => {
    wallet();
    server();
    setup({ initialNetwork: "mainnet-beta" });
    expect(radio("Mainnet-beta").checked).toBe(true);
    expect(screen.getByText(MAINNET_NOTE)).toBeTruthy();
  });

  it("disables the network choice while an attempt is in flight", async () => {
    wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    const group = screen.getByRole("group", { name: "Network" }) as HTMLFieldSetElement;
    expect(group.disabled).toBe(true);
  });
});

describe("wallet list", () => {
  it("shows install links and Refresh when no wallet is found", async () => {
    server();
    const user = setup();
    expect(screen.getByText("No Solana wallet found in this browser.")).toBeTruthy();
    for (const name of ["Get Phantom", "Get Solflare"]) {
      const link = screen.getByRole("link", { name: `${name} (opens in a new tab)` });
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("target")).toBe("_blank");
    }
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("No Solana wallet found in this browser.")).toBeTruthy();
    // A wallet that injects late (mobile in-app browsers) appears without a reload.
    act(() => {
      cleanups.push(createFakeWallet({ name: "Arrived" }).register());
    });
    expect(screen.getByRole("button", { name: "Arrived" })).toBeTruthy();
  });

  it("disables a wallet without signMessage and explains why", () => {
    wallet({ name: "No Sign", mode: "no-signMessage" });
    server();
    setup();
    const button = screen.getByRole("button", { name: "No Sign" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const note = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe(NO_WALLET_SIGN_IN);
  });
});

describe("status copy for every state", () => {
  it("connecting", async () => {
    const base = createFakeWallet({ name: "Slow" });
    const slow: Wallet = {
      ...base.wallet,
      accounts: base.wallet.accounts,
      features: {
        ...base.wallet.features,
        "standard:connect": { version: "1.0.0", connect: () => new Promise(() => undefined) },
      },
    };
    cleanups.push(getWallets().register(slow));
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Slow" }));
    expect(await screen.findByText("Connecting to Slow…")).toBeTruthy();
  });

  it("challenging", async () => {
    wallet();
    server({ "POST /api/v1/auth/challenge": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Preparing your sign-in…")).toBeTruthy();
  });

  it("awaiting-signature shows the preview: domain, truncated address, network", async () => {
    const fake = wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    const preview = screen.getByText("Domain").closest("dl") as HTMLElement;
    const address = fake.keys[0]?.address ?? "";
    expect(within(preview).getByText("localhost:3000")).toBeTruthy();
    expect(within(preview).getByText(`${address.slice(0, 4)}…${address.slice(-4)}`)).toBeTruthy();
    expect(within(preview).getByText("Devnet")).toBeTruthy();
  });

  it("verifying", async () => {
    wallet();
    server({ "POST /api/v1/auth/verify": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Verifying…")).toBeTruthy();
  });

  it("done (sign-in) navigates to /dashboard, refreshes and closes", async () => {
    wallet();
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    expect(routerMock.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(paths()).toEqual(["POST /api/v1/auth/challenge", "POST /api/v1/auth/verify"]);
  });

  it("done (link) shows Wallet linked., refreshes and focuses Close", async () => {
    wallet();
    server();
    const user = setup({ mode: "link" });
    expect(screen.getByRole("dialog", { name: "Link another wallet" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Wallet linked.")).toBeTruthy();
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    const close = screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement;
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(paths()).toEqual([
      "POST /api/v1/wallets/link/challenge",
      "POST /api/v1/wallets/link/verify",
    ]);
  });

  it("rejected → Try again requests a new challenge and succeeds", async () => {
    const fake = wallet({ mode: "reject" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You cancelled the sign-in.");
    fake.setMode("approve");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    expect(paths().filter((p) => p === "POST /api/v1/auth/challenge")).toHaveLength(2);
  });

  it("Try again uses the network selected after the failure", async () => {
    const fake = wallet({ mode: "reject" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("You cancelled the sign-in.");
    fake.setMode("approve");
    await user.click(radio("Mainnet-beta"));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    const bodies = await Promise.all(
      (api?.requests ?? [])
        .filter((r) => new URL(r.url).pathname === "/api/v1/auth/challenge")
        .map((r) => r.json() as Promise<{ network: string }>),
    );
    expect(bodies.map((b) => b.network)).toEqual(["devnet", "mainnet-beta"]);
  });

  it("disconnected → Reconnect", async () => {
    const fake = wallet({ mode: "disconnect" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Your wallet disconnected.");
    fake.setMode("approve");
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("account-changed → Start again", async () => {
    const fake = wallet({ mode: "switch-account" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Your wallet switched accounts. Start again with the new account.",
    );
    fake.setMode("hang");
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByText("Approve the sign-in request in your wallet.")).toBeTruthy();
    expect(paths().filter((p) => p === "POST /api/v1/auth/challenge")).toHaveLength(2);
  });

  it.each<[string, Partial<Record<ApiRouteKey, FakeHandler>>, string, string]>([
    [
      "AUTH_FAILED",
      {
        "POST /api/v1/auth/verify": () =>
          json(401, { code: "AUTH_FAILED", message: "Authentication failed" }),
      },
      "We couldn't verify that signature. Request a new sign-in.",
      "AUTH_FAILED",
    ],
    [
      "WALLET_ALREADY_LINKED",
      {
        "POST /api/v1/auth/verify": () =>
          json(409, { code: "WALLET_ALREADY_LINKED", message: "Conflict" }),
      },
      "That wallet is linked to another GHOST WIRE account.",
      "WALLET_ALREADY_LINKED",
    ],
    [
      "NETWORK_UNSUPPORTED",
      {
        "POST /api/v1/auth/challenge": () =>
          json(400, { code: "NETWORK_UNSUPPORTED", message: "Invalid request" }),
      },
      "That network isn't available right now.",
      "NETWORK_UNSUPPORTED",
    ],
    [
      "DEPENDENCY_UNAVAILABLE",
      {
        "POST /api/v1/auth/challenge": () =>
          json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "Service temporarily unavailable" }),
      },
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
      "DEPENDENCY_UNAVAILABLE",
    ],
    [
      "NETWORK (fetch rejects)",
      { "POST /api/v1/auth/challenge": () => Promise.reject(new TypeError("Failed to fetch")) },
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
      "NETWORK",
    ],
    [
      "INTERNAL",
      {
        "POST /api/v1/auth/verify": () =>
          json(500, { code: "INTERNAL", message: "Internal error" }),
      },
      "Something went wrong. Try again.",
      "INTERNAL",
    ],
  ])(
    "failed %s shows its copy, a retry, and no raw code",
    async (_label, overrides, copy, code) => {
      wallet();
      server(overrides);
      const user = setup();
      await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
      expect((await screen.findByRole("alert")).textContent).toBe(copy);
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      expect(document.body.textContent).not.toContain(code);
    },
  );
});

describe("rate limiting", () => {
  it("counts down from Retry-After and enables the retry at 0", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    wallet();
    server({
      "POST /api/v1/auth/challenge": () =>
        json(429, { code: "RATE_LIMITED", message: "Too many requests" }, { "Retry-After": "3" }),
    });
    const user = setup({}, userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many attempts. Try again in 3s.",
    );
    const retry = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Try again in 2s.");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("alert").textContent).toBe("You can try again now.");
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("closing and accounts", () => {
  it("closing aborts the attempt; nothing happens afterwards and reopening starts idle", async () => {
    const fake = wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    fake.setMode("approve");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fake.calls.signMessage).toBe(1);
    expect(paths()).not.toContain("POST /api/v1/auth/verify");
    expect(routerMock.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("button", { name: "Fake Wallet" })).toBeTruthy();
    expect(screen.queryByText("Approve the sign-in request in your wallet.")).toBeNull();
  });

  it("closing while verifying refreshes the router once", async () => {
    wallet();
    server({ "POST /api/v1/auth/verify": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Verifying…");
    expect(routerMock.refresh).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("closing while idle does not refresh", async () => {
    wallet();
    server();
    const user = setup();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("asks which account to use when the wallet has several, and signs with that key", async () => {
    const fake = wallet({ accountCount: 2 });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    const group = await screen.findByRole("group", { name: "Choose an account" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(2);
    const second = fake.keys[1]?.address ?? "";
    expect(group.textContent).toContain(`${second.slice(0, 4)}…${second.slice(-4)}`);
    await user.click(options[1] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    const verify = api?.requests.find((r) => new URL(r.url).pathname === "/api/v1/auth/verify");
    const body = (await verify?.json()) as { signature: string };
    expect(body.signature).toBe(fake.keys[1]?.sign(challenges[0] ?? ""));
  });

  it("skips the picker for a single account", async () => {
    wallet();
    server({ "POST /api/v1/auth/verify": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Verifying…");
    expect(screen.queryByRole("group", { name: "Choose an account" })).toBeNull();
  });
});
