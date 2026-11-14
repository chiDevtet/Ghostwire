import { E2E_ORIGIN } from "./support/origin";
import { expect, setWalletMode, signInWith, test, walletSignCount } from "./support/fixtures";

const WALLET = "GW Test Wallet A";

test("flow 1: connect on devnet, see the signing preview, sign in with an HttpOnly cookie", async ({
  page,
  context,
  wallets,
}) => {
  const key = wallets.key();
  await wallets.install(page, [{ name: WALLET, keys: [key] }]);
  const truncated = `${key.address.slice(0, 4)}…${key.address.slice(-4)}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await expect(dialog.getByRole("radio", { name: "Devnet" })).toBeChecked();

  // Hold the signature to read the preview, then close (aborts) and connect for real.
  await setWalletMode(page, "hang");
  await dialog.getByRole("button", { name: WALLET }).click();
  await expect(dialog.getByText("Approve the sign-in request in your wallet.")).toBeVisible();
  const preview = dialog.locator("dl");
  await expect(preview).toContainText(new URL(E2E_ORIGIN).host);
  await expect(preview).toContainText(truncated);
  await expect(preview).toContainText("Devnet");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await setWalletMode(page, "approve");
  await signInWith(page, WALLET);
  const header = page.getByRole("banner");
  await expect(header).toContainText("Devnet");
  await expect(header.getByRole("button", { name: "Wallet menu" })).toContainText(truncated);
  await expect(page.getByRole("main")).toContainText("Your wallet is connected.");

  const cookie = (await context.cookies()).find((c) => c.name === "gw_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
});

test("flow 2: reject the signature, then retry successfully", async ({ page, wallets }) => {
  await wallets.install(page, [{ name: WALLET, keys: [wallets.key()] }]);
  await page.goto("/");
  await setWalletMode(page, "reject");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await dialog.getByRole("button", { name: WALLET }).click();
  await expect(dialog.getByRole("alert")).toHaveText("You cancelled the sign-in.");
  await setWalletMode(page, "approve");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await walletSignCount(page)).toBe(2);
});

test("flow 3: the wallet disconnects mid-flow, then reconnects", async ({ page, wallets }) => {
  await wallets.install(page, [{ name: WALLET, keys: [wallets.key()] }]);
  await page.goto("/");
  await setWalletMode(page, "disconnect");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  await dialog.getByRole("button", { name: WALLET }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Your wallet disconnected.");
  await setWalletMode(page, "approve");
  await dialog.getByRole("button", { name: "Reconnect" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
