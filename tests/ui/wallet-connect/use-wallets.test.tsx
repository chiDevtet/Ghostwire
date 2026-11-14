import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useWallets } from "@/modules/wallet-connect";
import { createFakeWallet } from "../../helpers/fake-wallet";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function WalletNames() {
  const wallets = useWallets();
  return <p data-testid="names">{wallets.map((entry) => entry.name).join(",") || "none"}</p>;
}

describe("useWallets", () => {
  it("renders the server snapshot [] on the server", () => {
    cleanups.push(createFakeWallet({ name: "Present" }).register());
    expect(renderToString(<WalletNames />)).toContain("none");
  });

  it("re-renders on a late register and on unregister", () => {
    render(<WalletNames />);
    expect(screen.getByTestId("names").textContent).toBe("none");
    let unregister: () => void = () => undefined;
    act(() => {
      unregister = createFakeWallet({ name: "Late" }).register();
    });
    expect(screen.getByTestId("names").textContent).toBe("Late");
    act(() => unregister());
    expect(screen.getByTestId("names").textContent).toBe("none");
  });
});
