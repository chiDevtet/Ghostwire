import {
  expect,
  expectNoSeriousAxeViolations,
  setWalletMode,
  signInWith,
  test,
} from "./support/fixtures";

const WALLET = "GW Test Wallet A";

test("axe: signed-out pages, the connect modal and its signing state, and the 404", async ({
  page,
  wallets,
}) => {
  await wallets.install(page, [{ name: WALLET, keys: [wallets.key()] }]);
  await page.goto("/");
  await expectNoSeriousAxeViolations(page);

  await page.getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousAxeViolations(page);

  await setWalletMode(page, "hang");
  await dialog.getByRole("button", { name: WALLET }).click();
  await expect(dialog.getByText("Approve the sign-in request in your wallet.")).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press("Escape");

  const missing = await page.goto("/this-page-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test("axe: signed-in pages, the wallet menu and the unlink dialog", async ({ page, wallets }) => {
  await wallets.install(page, [{ name: WALLET, keys: [wallets.key()] }]);
  await signInWith(page, WALLET);
  await expectNoSeriousAxeViolations(page);

  await page.getByRole("button", { name: "Wallet menu" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press("Escape");

  await page.goto("/settings/wallets");
  await expectNoSeriousAxeViolations(page);
  await page.getByRole("button", { name: /^Unlink wallet/ }).click();
  await expect(page.getByRole("dialog", { name: "Unlink this wallet?" })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press("Escape");

  await page.goto("/settings/sessions");
  await expectNoSeriousAxeViolations(page);
});
