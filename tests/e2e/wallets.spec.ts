import { expect, signInWith, test } from "./support/fixtures";

test("flow 5: link a second wallet, unlink it, then try to unlink the last one", async ({
  page,
  wallets,
}) => {
  const a = wallets.key();
  const b = wallets.key();
  const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
  await wallets.install(page, [
    { name: "GW Test Wallet A", keys: [a] },
    { name: "GW Test Wallet B", keys: [b] },
  ]);
  await signInWith(page, "GW Test Wallet A");
  await page.goto("/settings/wallets");
  const list = page.getByRole("region", { name: "Wallets" }).getByRole("list").first();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Link another wallet" }).click();
  const link = page.getByRole("dialog", { name: "Link another wallet" });
  await link.getByRole("button", { name: "GW Test Wallet B" }).click();
  await expect(link).toContainText("Wallet linked.");
  await link.getByRole("button", { name: "Close" }).last().click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: `Unlink wallet ${short(b.address)}` }).click();
  const confirm = page.getByRole("dialog", { name: "Unlink this wallet?" });
  await expect(confirm).toContainText(
    "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.",
  );
  await confirm.getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByText("Wallet unlinked.")).toBeVisible();
  await expect(list.getByText("Active", { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: `Unlink wallet ${short(a.address)}` }).click();
  await confirm.getByRole("button", { name: "Unlink" }).click();
  await expect(confirm.getByRole("alert")).toHaveText("You can't unlink your only wallet.");
});
