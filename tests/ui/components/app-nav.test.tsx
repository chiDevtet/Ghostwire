import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { Sidebar } from "@/components/app-shell/sidebar";
import { SettingsNav } from "@/components/settings-nav";
import { routerMock, setPathname } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

/** Each entry's visible label: the first <span> inside its link or button. */
function names(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("a > span, button > span")?.textContent ?? "");
}

describe("Sidebar", () => {
  it("marks Dashboard current on /dashboard and lists Send/Receive/Payments/Activity as Soon", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(names(nav)).toEqual([
      "Dashboard",
      "Send",
      "Receive",
      "Payments",
      "Activity",
      "Settings",
    ]);
    const dashboard = within(nav).getByRole("link", { name: "Dashboard" });
    expect(dashboard.getAttribute("aria-current")).toBe("page");
    expect(dashboard.getAttribute("href")).toBe("/dashboard");
    expect(
      within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current"),
    ).toBeNull();
    for (const label of ["Send", "Receive", "Payments", "Activity"]) {
      expect(within(nav).queryByRole("link", { name: new RegExp(label) })).toBeNull();
      const button = within(nav).getByRole("button", { name: `${label} Soon` });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      const description = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(description?.textContent).toBe("Soon");
    }
  });

  it("marks Settings current on any settings page", () => {
    setPathname("/settings/sessions");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("does nothing when a Soon item is pressed", async () => {
    render(<Sidebar />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send Soon" }));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe("BottomNav", () => {
  it("shows Home, Send, Receive and Activity, and no Settings or Payments", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main mobile" });
    expect(names(nav)).toEqual(["Home", "Send", "Receive", "Activity"]);
    expect(within(nav).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "Settings" })).toBeNull();
    expect(
      within(nav).getByRole("button", { name: "Activity Soon" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("SettingsNav", () => {
  it("marks the open settings page", () => {
    setPathname("/settings/wallets");
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Wallets" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Sessions" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
