import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Address, truncateAddress } from "@/ui/address";

const FULL = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";

afterEach(() => {
  vi.useRealTimers();
});

describe("truncateAddress", () => {
  it.each([
    [FULL, "7Np4…T4K2"],
    ["abcdefghijk", "abcd…hijk"],
    ["abcdefghij", "abcdefghij"],
    ["", ""],
  ])("%s → %s", (value, expected) => {
    expect(truncateAddress(value)).toBe(expected);
  });
});

describe("Address", () => {
  it("shows the truncated value, keeps the full value in sr-only text and title", () => {
    const { container } = render(<Address value={FULL} />);
    const mono = container.querySelector(".font-mono");
    expect(mono?.getAttribute("title")).toBe(FULL);
    expect(mono?.querySelector('[aria-hidden="true"]')?.textContent).toBe("7Np4…T4K2");
    expect(mono?.querySelector(".sr-only")?.textContent).toBe(FULL);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("copies the full value and announces it, then clears the announcement", async () => {
    const user = userEvent.setup();
    render(<Address value={FULL} copyable />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(await navigator.clipboard.readText()).toBe(FULL);
    expect(screen.getByRole("status").textContent).toBe("Address copied");
  });

  it("announces a failed copy", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<Address value={FULL} copyable />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(screen.getByRole("status").textContent).toBe("Couldn't copy the address");
  });

  it("clears the status after 2000 ms", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<Address value={FULL} copyable />);
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Address copied");
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole("status").textContent).toBe("Address copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
