import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "@/ui/segmented-control";

type Network = "devnet" | "mainnet-beta";

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<Network>("devnet");
  return (
    <SegmentedControl
      legend="Network"
      name="network"
      value={value}
      disabled={disabled}
      options={[
        { value: "devnet", label: "Devnet" },
        { value: "mainnet-beta", label: "Mainnet-beta" },
      ]}
      onChange={setValue}
    />
  );
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("SegmentedControl", () => {
  it("is a fieldset with a legend and native radios", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Network" }).tagName).toBe("FIELDSET");
    expect(radio("Devnet").checked).toBe(true);
    expect(radio("Mainnet-beta").checked).toBe(false);
  });

  it("changes the selection by click and by arrow key", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(radio("Mainnet-beta"));
    expect(radio("Mainnet-beta").checked).toBe(true);
    await user.keyboard("{ArrowLeft}");
    expect(radio("Devnet").checked).toBe(true);
  });

  it("disables every option", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    const group = screen.getByRole("group", { name: "Network" }) as HTMLFieldSetElement;
    expect(group.disabled).toBe(true);
    await user.click(radio("Mainnet-beta"));
    expect(radio("Devnet").checked).toBe(true);
  });
});
