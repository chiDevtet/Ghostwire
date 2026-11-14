import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuButton } from "@/ui/menu";
import { WalletStatus } from "@/ui/wallet-status";

function setup() {
  const onCopy = vi.fn();
  const onSwitch = vi.fn();
  const onSignOut = vi.fn();
  render(
    <>
      <MenuButton
        label="Account"
        accessibleLabel="Wallet menu"
        items={[
          { id: "copy", label: "Copy address", onSelect: onCopy },
          { id: "switch", label: "Switch to Mainnet-beta", onSelect: onSwitch },
          { id: "out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
        ]}
      />
      <button type="button">Outside</button>
    </>,
  );
  return {
    user: userEvent.setup(),
    button: screen.getByRole("button", { name: /^Wallet menu/ }),
    onCopy,
    onSignOut,
  };
}

const focused = () => document.activeElement?.textContent;

describe("MenuButton", () => {
  it("announces a closed menu button", () => {
    const { button } = setup();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ArrowDown opens and focuses the first item; ArrowUp opens at the last", async () => {
    const { user, button } = setup();
    button.focus();
    await user.keyboard("{ArrowDown}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(screen.getByRole("menu").id);
    expect(focused()).toBe("Copy address");
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Sign out");
  });

  it("Enter on the button opens at the first item", async () => {
    const { user, button } = setup();
    button.focus();
    await user.keyboard("{Enter}");
    expect(focused()).toBe("Copy address");
  });

  it("moves with ArrowDown/ArrowUp (wrapping), Home and End", async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Switch to Mainnet-beta");
    await user.keyboard("{End}");
    expect(focused()).toBe("Sign out");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Copy address");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Sign out");
    await user.keyboard("{Home}");
    expect(focused()).toBe("Copy address");
  });

  it("Enter selects, closes and returns focus to the button", async () => {
    const { user, button, onSignOut } = setup();
    await user.click(button);
    await user.keyboard("{End}{Enter}");
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Escape closes and returns focus; a click outside closes", async () => {
    const { user, button, onCopy } = setup();
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("selects an item by click", async () => {
    const { user, button, onCopy } = setup();
    await user.click(button);
    await user.click(screen.getByRole("menuitem", { name: "Copy address" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

describe("WalletStatus", () => {
  it.each([
    ["devnet", "Switch to Mainnet-beta"],
    ["mainnet-beta", "Switch to Devnet"],
  ] as const)("offers Copy address, %s → %s and Sign out", async (network, switchLabel) => {
    const onSwitchNetwork = vi.fn();
    const user = userEvent.setup();
    render(
      <WalletStatus
        address="7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2"
        network={network}
        onCopyAddress={vi.fn()}
        onSwitchNetwork={onSwitchNetwork}
        onSignOut={vi.fn()}
      />,
    );
    // The visible truncated address is part of the accessible name (WCAG 2.5.3).
    const button = screen.getByRole("button", { name: "Wallet menu 7Np4…T4K2" });
    await user.click(button);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy address",
      switchLabel,
      "Sign out",
    ]);
    await user.click(screen.getByRole("menuitem", { name: switchLabel }));
    expect(onSwitchNetwork).toHaveBeenCalledTimes(1);
  });
});
