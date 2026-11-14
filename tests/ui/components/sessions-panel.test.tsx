import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsPanel } from "@/components/sessions-panel";
import type { SessionItem } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const CURRENT: SessionItem = {
  id: "a".repeat(24),
  current: true,
  createdAt: "2026-11-13T09:00:00.000Z",
  lastSeenAt: "2026-11-13T10:00:00.000Z",
  expiresAt: "2026-11-20T10:00:00.000Z",
  network: "devnet",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/158",
};
const OTHER: SessionItem = {
  id: "b".repeat(24),
  current: false,
  createdAt: "2026-11-12T09:00:00.000Z",
  lastSeenAt: "2026-11-12T11:15:00.000Z",
  expiresAt: "2026-11-19T11:15:00.000Z",
  network: "mainnet-beta",
  userAgent: null,
};

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(revoke: FakeHandler = () => noContent()) {
  api = mockApi({ "DELETE /api/v1/sessions/:id": revoke });
  render(
    <ToastProvider>
      <SessionsPanel sessions={[CURRENT, OTHER]} />
    </ToastProvider>,
  );
  return userEvent.setup();
}

const rows = () => screen.getAllByRole("listitem");

describe("SessionsPanel", () => {
  it("marks this device and shows network, device, last seen and expiry", () => {
    setup();
    const [current, other] = rows();
    expect(current?.textContent).toContain("This device");
    expect(current?.textContent).toContain("Devnet");
    expect(current?.textContent).toContain("Nov 13, 2026, 10:00 AM UTC");
    expect(current?.textContent).toContain("Nov 20, 2026, 10:00 AM UTC");
    expect(within(current as HTMLElement).getByTitle(CURRENT.userAgent ?? "")).toBeTruthy();
    expect(other?.textContent).not.toContain("This device");
    expect(other?.textContent).toContain("Unknown device");
    expect(other?.textContent).toContain("Mainnet-beta");
  });

  it("revokes another session after confirmation, toasts and refreshes", async () => {
    const user = setup();
    await user.click(within(rows()[1] as HTMLElement).getByRole("button", { name: /^Revoke/ }));
    const dialog = screen.getByRole("dialog", { name: "Revoke this session?" });
    expect(dialog.textContent).toContain("That device will be signed out of GHOST WIRE.");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `DELETE /api/v1/sessions/${OTHER.id}`,
    ]);
    expect(screen.getByRole("status").textContent).toContain("Session revoked.");
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("signs out this device and returns to the start page", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    const dialog = screen.getByRole("dialog", { name: "Sign out this device?" });
    expect(dialog.textContent).toContain("You'll be signed out and returned to the start page.");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("status").textContent).toContain("This device was signed out.");
    expect(api?.requests).toHaveLength(1);
  });

  it("sends nothing on Cancel", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api?.requests).toHaveLength(0);
  });

  it("shows the generic copy for an unexpected failure", async () => {
    const user = setup(() => json(500, { code: "INTERNAL", message: "Internal error" }));
    await user.click(within(rows()[1] as HTMLElement).getByRole("button", { name: /^Revoke/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("closes and refreshes on NOT_FOUND", async () => {
    const user = setup(() => json(404, { code: "NOT_FOUND", message: "x" }));
    await user.click(within(rows()[1] as HTMLElement).getByRole("button", { name: /^Revoke/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
