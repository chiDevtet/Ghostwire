import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/ui/confirm-dialog";

const BASE = {
  open: true,
  title: "Unlink this wallet?",
  body: "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.",
  confirmLabel: "Unlink",
};

describe("ConfirmDialog", () => {
  it("shows the title and body and focuses Cancel first", () => {
    render(<ConfirmDialog {...BASE} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: BASE.title })).toBeTruthy();
    expect(screen.getByText(BASE.body)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("calls onConfirm and onCancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...BASE} onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("marks the confirm button busy while pending", () => {
    render(<ConfirmDialog {...BASE} pending onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const busy = screen.getAllByRole("button").find((b) => b.getAttribute("aria-busy") === "true");
    expect(busy?.textContent).toContain("Unlink");
  });

  it("shows an error in a role=alert paragraph", () => {
    render(
      <ConfirmDialog
        {...BASE}
        error="You can't unlink your only wallet."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("You can't unlink your only wallet.");
  });
});
