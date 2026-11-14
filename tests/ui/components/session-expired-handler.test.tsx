import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionExpiredHandler } from "@/components/session-expired-handler";
import { me } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, type FakeApi } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

describe("SessionExpiredHandler", () => {
  it("toasts and returns to / when an API call answers UNAUTHENTICATED", async () => {
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    render(
      <ToastProvider>
        <SessionExpiredHandler />
      </ToastProvider>,
    );
    await me();
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("status").textContent).toContain(
      "Your session ended. Sign in again to continue.",
    );
  });

  it("unregisters on unmount", async () => {
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    const { unmount } = render(
      <ToastProvider>
        <SessionExpiredHandler />
      </ToastProvider>,
    );
    unmount();
    await me();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
