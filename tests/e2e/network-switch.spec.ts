import { expect, signInWith, test } from "./support/fixtures";

const WALLET = "GW Test Wallet A";

test("flow 4: switch to mainnet-beta replaces the devnet session", async ({ page, wallets }) => {
  await wallets.install(page, [{ name: WALLET, keys: [wallets.key()] }]);
  await signInWith(page, WALLET);
  const header = page.getByRole("banner");
  await expect(header).toContainText("Devnet");

  await header.getByRole("button", { name: "Wallet menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to Mainnet-beta" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await expect(dialog.getByRole("radio", { name: "Mainnet-beta" })).toBeChecked();
  await expect(dialog).toContainText(
    "Private payments aren't available on mainnet yet. Signing in only links your wallet.",
  );
  await dialog.getByRole("button", { name: WALLET }).click();
  await expect(dialog).toBeHidden();
  await expect(header).toContainText("Mainnet-beta");

  await page.goto("/settings/sessions");
  const sessions = page.getByRole("region", { name: "Active sessions" }).getByRole("listitem");
  await expect(sessions).toHaveCount(1);
  await expect(sessions.first()).toContainText("This device");
  await expect(sessions.first()).toContainText("Mainnet-beta");
});
