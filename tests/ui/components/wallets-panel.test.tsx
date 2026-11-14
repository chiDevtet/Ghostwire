import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletsPanel } from "@/components/wallets-panel";
import type { WalletItem } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const CURRENT: WalletItem = {
  id: "a".repeat(24),
  address: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
  network: "devnet",
  provider: "phantom",
  status: "active",
  linkedAt: "2026-11-13T10:00:00.000Z",
};
const OTHER: WalletItem = {
  id: "b".repeat(24),
  address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: "2026-11-12T08:30:00.000Z",
};
const GONE: WalletItem = {
  id: "c".repeat(24),
  address: "So11111111111111111111111111111111111111112",
  network: "mainnet-beta",
  provider: "solflare",
  status: "disconnected",
  linkedAt: "2026-11-01T00:00:00.000Z",
};

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(
  unlink: FakeHandler = () => noContent(),
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  api = mockApi({ "DELETE /api/v1/wallets/:id": unlink });
  render(
    <ToastProvider>
      <WalletsPanel
        wallets={[CURRENT, OTHER, GONE]}
        currentWalletId={CURRENT.id}
        network={network}
      />
    </ToastProvider>,
  );
  return userEvent.setup();
}

/** The toast provider's polite region (Address copy buttons add their own status regions). */
function toastRegion(): HTMLElement {
  const region = screen
    .getAllByRole("status")
    .find((el) => el.getAttribute("aria-live") === "polite");
  if (region === undefined) throw new Error("no toast region");
  return region;
}

function row(address: string): HTMLElement {
  return screen.getByTitle(address).closest("li") as HTMLElement;
}

async function openUnlink(user: ReturnType<typeof userEvent.setup>, wallet: WalletItem) {
  await user.click(within(row(wallet.address)).getByRole("button", { name: /^Unlink/ }));
  return screen.getByRole("dialog", { name: "Unlink this wallet?" });
}

describe("WalletsPanel", () => {
  it("renders address, network, provider, status and linked date per wallet", () => {
    setup();
    const current = row(CURRENT.address);
    expect(current.textContent).toContain("7Np4…T4K2");
    expect(current.textContent).toContain("Devnet");
    expect(current.textContent).toContain("phantom");
    expect(current.textContent).toContain("Active");
    expect(current.textContent).toContain("Nov 13, 2026, 10:00 AM UTC");
    expect(row(OTHER.address).textContent).toContain("Unknown");
    const gone = row(GONE.address);
    expect(gone.textContent).toContain("Unlinked");
    expect(gone.textContent).toContain("Mainnet-beta");
    expect(within(gone).queryByRole("button", { name: /^Unlink/ })).toBeNull();
  });

  it("opens the link modal in link mode on the session network", async () => {
    const user = setup(undefined, "mainnet-beta");
    await user.click(screen.getByRole("button", { name: "Link another wallet" }));
    const dialog = screen.getByRole("dialog", { name: "Link another wallet" });
    expect(
      (within(dialog).getByRole("radio", { name: "Mainnet-beta" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("confirms with the exact copy, unlinks another wallet, toasts and refreshes", async () => {
    const user = setup();
    const dialog = await openUnlink(user, OTHER);
    expect(dialog.textContent).toContain(
      "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `DELETE /api/v1/wallets/${OTHER.id}`,
    ]);
    expect(toastRegion().textContent).toContain("Wallet unlinked.");
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends nothing on Cancel", async () => {
    const user = setup();
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api?.requests).toHaveLength(0);
  });

  it("shows LAST_WALLET inside the dialog", async () => {
    const user = setup(() => json(409, { code: "LAST_WALLET", message: "Conflict" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You can't unlink your only wallet.",
    );
    expect(dialog.textContent).not.toContain("LAST_WALLET");
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("signs out after unlinking the current wallet", async () => {
    const user = setup();
    const dialog = await openUnlink(user, CURRENT);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(toastRegion().textContent).toContain(
      "You unlinked the wallet you signed in with, so you've been signed out.",
    );
  });

  it("closes and refreshes on NOT_FOUND", async () => {
    const user = setup(() => json(404, { code: "NOT_FOUND", message: "Not found" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the unreachable copy on a 503", async () => {
    const user = setup(() => json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "x" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
    );
  });

  it("ignores a failure that arrives after Cancel, so the next confirmation is clean", async () => {
    let fail: () => void = () => undefined;
    const hang = new Promise<void>((resolve) => {
      fail = resolve;
    });
    const user = setup(async () => {
      await hang;
      return json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "x" });
    });
    const first = await openUnlink(user, OTHER);
    await user.click(within(first).getByRole("button", { name: "Unlink" }));
    await user.click(within(first).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fail();
    await waitFor(() => expect(api?.requests).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await openUnlink(user, CURRENT);
    expect(within(second).queryByRole("alert")).toBeNull();
    expect(second.textContent).not.toContain("can't reach");
    expect(within(second).getByRole("button", { name: "Unlink" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("closes without navigating on UNAUTHENTICATED", async () => {
    const user = setup(() => json(401, { code: "UNAUTHENTICATED", message: "x" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
