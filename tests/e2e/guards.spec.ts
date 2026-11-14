import { expect, test } from "./support/fixtures";

test.describe("flow 7: signed-out guard", () => {
  for (const path of ["/settings/wallets", "/dashboard", "/settings/sessions"]) {
    test(`${path} redirects to / when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
    });
  }
});

test("pages carry the nonce CSP and the security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("'nonce-");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("unsafe-eval");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  // The page hydrated under that policy: the connect button opens the modal.
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("dialog", { name: "Connect a wallet" })).toBeVisible();
});

test("API responses carry the locked-down API CSP and no-store", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
});

test("a new nonce on every page response", async ({ request }) => {
  const nonce = async () =>
    /'nonce-([^']+)'/.exec(
      (await request.get("/")).headers()["content-security-policy"] ?? "",
    )?.[1];
  const [first, second] = [await nonce(), await nonce()];
  expect(first).toBeTruthy();
  expect(first).not.toBe(second);
});
