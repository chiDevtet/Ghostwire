import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

describe("ServiceUnavailable", () => {
  it("is a page with its own main and h1 and retries with router.refresh()", async () => {
    render(<ServiceUnavailable />);
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "We can't reach GHOST WIRE right now.",
    );
    expect(main.textContent).toContain("Check your connection and try again.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders as a section with an h2 inside the shell", () => {
    render(<ServiceUnavailable variant="section" />);
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "We can't reach GHOST WIRE right now.",
    );
  });
});
