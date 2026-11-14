import type { Page } from "@playwright/test";
import { expect, signInWith, test } from "./support/fixtures";

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("flow 8: mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no horizontal scroll at 390px and 320px; the bottom nav replaces the sidebar", async ({
    page,
    wallets,
  }) => {
    await wallets.install(page, [{ name: "GW Test Wallet A", keys: [wallets.key()] }]);
    await signInWith(page, "GW Test Wallet A");
    for (const path of ["/dashboard", "/settings/wallets", "/settings/sessions"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      await expect(page.getByRole("navigation", { name: "Main mobile" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeHidden();
    }
    await page.goto("/");
    await expectNoHorizontalScroll(page);

    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ["/", "/dashboard"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
  });
});
