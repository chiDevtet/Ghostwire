import { describe, expect, it } from "vitest";
import { SOLANA_NETWORK_IDS, solanaNetwork } from "@/modules/validation";

describe("solanaNetwork", () => {
  it("lists exactly devnet and mainnet-beta", () => {
    expect(SOLANA_NETWORK_IDS).toEqual(["devnet", "mainnet-beta"]);
  });

  it.each(["devnet", "mainnet-beta"])("accepts %s", (value) => {
    expect(solanaNetwork.parse(value)).toBe(value);
  });

  it.each(["testnet", "mainnet", "Devnet", "", " devnet", 1, null])("rejects %j", (value) => {
    expect(solanaNetwork.safeParse(value).success).toBe(false);
  });
});
