import { describe, expect, it } from "vitest";
import { PROVIDER_PATTERN } from "@/modules/wallet";
import { toProviderId } from "@/modules/wallet-connect";

describe("toProviderId", () => {
  it.each([
    ["Phantom", "phantom"],
    ["Solflare", "solflare"],
    ["Backpack Wallet", "backpack-wallet"],
    ["  GW Test Wallet A  ", "gw-test-wallet-a"],
    ["a".repeat(40), "a".repeat(32)],
  ])("%s → %s", (name, expected) => {
    const id = toProviderId(name);
    expect(id).toBe(expected);
    expect(PROVIDER_PATTERN.test(id ?? "")).toBe(true);
  });

  it.each(["!!!", "", "   "])("returns undefined for %j", (name) => {
    expect(toProviderId(name)).toBeUndefined();
  });
});
