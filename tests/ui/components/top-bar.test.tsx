import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "@/components/app-shell/top-bar";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const ADDRESS = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";
let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(
  logout: FakeHandler = () => noContent(),
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  api = mockApi({ "POST /api/v1/auth/logout": logout });
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <TopBar viewer={{ address: ADDRESS, network }} />
    </ToastProvider>,
  );
  return user;
}

const politeText = () =>
  screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite")
    ?.textContent ?? "";

describe("TopBar", () => {
  it("shows the wordmark, the network as text, a Settings link and the wallet menu", () => {
    setup(undefined, "mainnet-beta");
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "GHOST WIRE" }).getAttribute("href")).toBe(
      "/dashboard",
    );
    expect(header.textContent).toContain("Mainnet-beta");
    expect(within(header).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/settings/wallets",
    );
    expect(within(header).getByRole("button", { name: /^Wallet menu/ }).textContent).toContain(
      "7Np4…T4K2",
    );
  });

  it("signs out: POST /auth/logout, toast, then replace('/') and refresh", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      "POST /api/v1/auth/logout",
    ]);
    expect(politeText()).toContain("You're signed out.");
  });

  it("shows an error toast and stays when sign-out fails", async () => {
    const user = setup(() => json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "x" }));
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "We can't reach GHOST WIRE right now. Check your connection and try again.",
      ),
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("Switch network opens the sign-in modal on the other network", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Switch to Mainnet-beta" }));
    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect(
      (within(dialog).getByRole("radio", { name: "Mainnet-beta" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(dialog.textContent).toContain("Private payments aren't available on mainnet yet.");
  });

  it("Copy address copies the full address and confirms with a toast", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Copy address" }));
    expect(await navigator.clipboard.readText()).toBe(ADDRESS);
    await waitFor(() => expect(politeText()).toContain("Address copied"));
  });
});
