import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/ui/dialog";

function Harness({
  onClose = () => undefined,
  autofocus = false,
}: {
  onClose?: () => void;
  autofocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        title="Connect a wallet"
        description="Pick a wallet."
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">First action</button>
        <button type="button" data-autofocus={autofocus ? "" : undefined}>
          Last action
        </button>
      </Dialog>
    </>
  );
}

async function openDialog(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  return user;
}

describe("Dialog", () => {
  it("is not in the accessibility tree while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens modal, labelled by its title and described by its description", async () => {
    await openDialog();
    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    const describedBy = dialog.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Pick a wallet.");
  });

  it("focuses the first focusable element (the Close button) on open", async () => {
    await openDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("focuses [data-autofocus] when present", async () => {
    await openDialog({ autofocus: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last action" }));
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    const user = await openDialog();
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last action" });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First action" }));
    await user.tab();
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const onClose = vi.fn();
    const user = await openDialog({ onClose });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });

  it("closes with the Close button", async () => {
    const onClose = vi.fn();
    const user = await openDialog({ onClose });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when the browser closes the dialog on its own", async () => {
    const onClose = vi.fn();
    await openDialog({ onClose });
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
