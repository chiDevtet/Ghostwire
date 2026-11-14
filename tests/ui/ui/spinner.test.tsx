import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "@/ui/spinner";

describe("Spinner", () => {
  it("always shows its label as text and hides the ring and dot from assistive tech", () => {
    const { container } = render(<Spinner label="Verifying…" />);
    expect(screen.getByText("Verifying…")).toBeTruthy();
    const ring = container.querySelector('[data-part="ring"]');
    const dot = container.querySelector('[data-part="dot"]');
    expect(ring?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(ring?.className).toContain("motion-reduce:hidden");
    expect(dot?.className).toContain("motion-reduce:inline-block");
  });
});
