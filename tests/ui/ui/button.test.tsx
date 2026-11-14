import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/ui/button";

describe("Button", () => {
  it("defaults to type=button and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("type")).toBe("button");
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["primary", "bg-violet"],
    ["secondary", "border-muted"],
    ["ghost", "bg-transparent"],
    ["danger", "bg-error"],
  ] as const)("renders the %s variant", (variant, token) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button").className).toContain(token);
  });

  it("while loading: aria-busy, aria-disabled, ignores clicks, keeps the label in the DOM", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Signing out…" onClick={onClick}>
        Sign out
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("Sign out");
    expect(button.textContent).toContain("Signing out…");
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is natively disabled when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Retry
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
