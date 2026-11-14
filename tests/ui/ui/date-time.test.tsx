import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateTime, formatUtc } from "@/ui/date-time";
import { NetworkIndicator, networkLabel } from "@/ui/network-indicator";

describe("DateTime", () => {
  it("formats in UTC with a UTC suffix, independent of the local time zone", () => {
    expect(formatUtc("2026-11-13T23:30:00.000Z")).toBe("Nov 13, 2026, 11:30 PM UTC");
  });

  it("renders a <time> with the ISO value", () => {
    const { container } = render(<DateTime iso="2026-11-13T10:00:00.000Z" />);
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-11-13T10:00:00.000Z");
    expect(time?.textContent).toBe("Nov 13, 2026, 10:00 AM UTC");
  });

  it("returns an invalid value unchanged instead of throwing", () => {
    expect(formatUtc("not a date")).toBe("not a date");
  });
});

describe("NetworkIndicator", () => {
  it.each([
    ["devnet", "Devnet", "bg-success"],
    ["mainnet-beta", "Mainnet-beta", "bg-warning"],
  ] as const)("shows %s as text plus a hidden dot", (network, label, dot) => {
    const { container } = render(<NetworkIndicator network={network} />);
    expect(networkLabel(network)).toBe(label);
    expect(screen.getByText(label)).toBeTruthy();
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker?.className).toContain(dot);
  });
});
