import { expect, signInWith, test } from "./support/fixtures";
import { E2E_ORIGIN } from "./support/origin";

test("flow 6: signing out this device returns to / and clears the cookie", async ({
  page,
  context,
  wallets,
}) => {
  await wallets.install(page, [{ name: "GW Test Wallet A", keys: [wallets.key()] }]);
  await signInWith(page, "GW Test Wallet A");
  expect((await context.cookies()).some((c) => c.name === "gw_session")).toBe(true);

  await page.goto("/settings/sessions");
  await page.getByRole("button", { name: "Sign out this device" }).click();
  const confirm = page.getByRole("dialog", { name: "Sign out this device?" });
  await confirm.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open GHOST WIRE" })).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === "gw_session")).toBe(false);
});

const CLIENT_NAVIGATIONS = [
  { from: "/dashboard", link: 'a[href="/settings/wallets"]' },
  { from: "/settings/wallets", link: 'a[href="/settings/sessions"]' },
  { from: "/settings/sessions", link: 'a[href="/dashboard"]' },
] as const;

test("revoked session then client navigation redirects to /", async ({
  page,
  context,
  wallets,
}) => {
  await wallets.install(page, [{ name: "GW Test Wallet A", keys: [wallets.key()] }]);
  // One pass per guarded page: each (app) page must redirect on its own, because a client
  // navigation does not re-run the layout.
  for (const { from, link } of CLIENT_NAVIGATIONS) {
    await signInWith(page, "GW Test Wallet A");
    await page.goto(from);
    await expect(page.locator(link).first()).toBeVisible();

    // Revoke server-side without reloading the page; the cookie jar is shared with the page.
    const logout = await page.request.post("/api/v1/auth/logout", {
      headers: { origin: E2E_ORIGIN },
    });
    expect(logout.ok()).toBe(true);
    expect((await context.cookies()).some((c) => c.name === "gw_session")).toBe(false);

    await page.locator(link).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  }
});
