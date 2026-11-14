import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastInput } from "@/ui/toast";

afterEach(() => {
  vi.useRealTimers();
});

/** One "Show N" button per input. */
function Probe({ inputs }: { readonly inputs: readonly ToastInput[] }) {
  const { show } = useToast();
  return (
    <>
      {inputs.map((input, index) => (
        <button key={input.message} type="button" onClick={() => show(input)}>
          {`Show ${index}`}
        </button>
      ))}
    </>
  );
}

function setup(inputs: readonly ToastInput[]) {
  render(
    <ToastProvider>
      <Probe inputs={inputs} />
    </ToastProvider>,
  );
  return (index: number) => fireEvent.click(screen.getByRole("button", { name: `Show ${index}` }));
}

describe("ToastProvider", () => {
  it("renders both live regions before any toast exists", () => {
    setup([]);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("puts info and success in the status region and errors in the alert region", () => {
    const show = setup([
      { message: "Session revoked." },
      { message: "Wallet linked.", tone: "success" },
      { message: "Something went wrong. Try again.", tone: "error" },
    ]);
    show(0);
    show(1);
    show(2);
    const status = screen.getByRole("status").textContent;
    expect(status).toContain("Session revoked.");
    expect(status).toContain("Wallet linked.");
    expect(status).not.toContain("Something went wrong");
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Try again.");
  });

  it("removes a toast with Dismiss", async () => {
    const show = setup([{ message: "You're signed out." }]);
    show(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("auto-dismisses after 6000 ms", () => {
    vi.useFakeTimers();
    const show = setup([{ message: "Address copied" }]);
    show(0);
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole("status").textContent).toContain("Address copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("throws when useToast is used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe inputs={[]} />)).toThrow(
      "useToast must be used inside ToastProvider",
    );
  });
});
