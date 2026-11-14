import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { createE2eKey, type E2eKey } from "./keys";
import { E2E_ORIGIN } from "./origin";
import { installTestWallets, type TestWalletControl, type TestWalletMode } from "./test-wallet";

export { expect };

const ICON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" rx="6" fill="#A78BFA"/></svg>',
).toString("base64")}`;

export interface WalletKit {
  /** page.addInitScript(installTestWallets, …); every address is remembered for the privacy guard. */
  install(page: Page, wallets: readonly { name: string; keys: readonly E2eKey[] }[]): Promise<void>;
  /** createE2eKey(), remembered for the privacy guard. */
  key(): E2eKey;
}

interface Fixtures {
  wallets: WalletKit;
  guards: void;
  addresses: string[];
}

/**
 * (Fixture callbacks name Playwright's `use` argument `provide`: react-hooks lints any `use` call.)
 * Every test gets: `wallets` to create keys and inject test wallets, and an automatic `guards`
 * fixture that fails the test when any request leaves the app origin, any URL or the title
 * contains a test wallet address, a page response lacks a nonce CSP, the console reports a CSP
 * violation, or localStorage contains an address.
 */
export const test = base.extend<Fixtures>({
  addresses: async ({}, provide) => {
    await provide([]);
  },
  wallets: async ({ addresses }, provide) => {
    await provide({
      async install(page, wallets) {
        for (const wallet of wallets) addresses.push(...wallet.keys.map((key) => key.address));
        await page.addInitScript(installTestWallets, {
          wallets: wallets.map((wallet) => ({
            name: wallet.name,
            icon: ICON,
            accounts: wallet.keys,
          })),
        });
      },
      key() {
        const key = createE2eKey();
        addresses.push(key.address);
        return key;
      },
    });
  },
  guards: [
    async ({ context, addresses }, provide) => {
      const requestUrls: string[] = [];
      const navigations: string[] = [];
      const titles: string[] = [];
      const problems: string[] = [];
      const pending: Promise<unknown>[] = [];
      const pages = new Set<Page>();

      // Attached to every page of the context (popups included), not only the `page` fixture.
      const watch = (watched: Page): void => {
        pages.add(watched);
        watched.on("framenavigated", (frame) => {
          navigations.push(frame.url());
          if (frame === watched.mainFrame()) {
            // Best effort per navigation (the page may close first); the final reads below throw.
            pending.push(
              watched.title().then(
                (title) => titles.push(title),
                () => undefined,
              ),
            );
          }
        });
        watched.on("domcontentloaded", () => {
          pending.push(
            watched.title().then(
              (title) => titles.push(title),
              () => undefined,
            ),
          );
        });
        watched.on("console", (message) => {
          if (/Content Security Policy/i.test(message.text()))
            problems.push(`CSP console: ${message.text()}`);
        });
      };
      // Context-level request/response events also see a popup's very first request, which a
      // page-level listener attached from "page" would miss.
      context.on("request", (request) => requestUrls.push(request.url()));
      context.on("response", (response) => {
        if (response.request().resourceType() !== "document") return;
        if (response.status() >= 300 && response.status() < 400) return;
        const csp = response.headers()["content-security-policy"] ?? "";
        if (!csp.includes("'nonce-")) problems.push(`no nonce CSP on ${response.url()}`);
      });
      // Every title the document ever has, including ones replaced before the next navigation.
      await context.exposeFunction("__gwReportTitle", (title: string) => {
        titles.push(title);
      });
      await context.addInitScript(() => {
        if (window.top !== window) return;
        const report = (): void => {
          const hook = (window as unknown as { __gwReportTitle?: (t: string) => void })
            .__gwReportTitle;
          if (typeof hook === "function") hook(document.title);
        };
        new MutationObserver(report).observe(document, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      });
      for (const existing of context.pages()) watch(existing);
      context.on("page", watch);

      await provide();

      await Promise.all(pending);
      for (const url of requestUrls) {
        if (url.startsWith("data:") || url.startsWith("blob:")) continue;
        if (new URL(url).origin !== E2E_ORIGIN) problems.push(`third-party request: ${url}`);
      }
      const texts = [...requestUrls, ...navigations, ...titles];
      for (const watched of pages) {
        if (watched.isClosed() || new URL(watched.url()).origin !== E2E_ORIGIN) continue;
        // No catch: a storage read that throws must fail the test, not pass silently.
        texts.push(await watched.title());
        texts.push(
          await watched.evaluate(async () =>
            JSON.stringify({
              local: { ...localStorage },
              session: { ...sessionStorage },
              indexedDB: (await indexedDB.databases()).map((database) => database.name),
            }),
          ),
        );
      }
      for (const address of addresses) {
        if (texts.some((text) => text.includes(address)))
          problems.push(`address leaked: ${address}`);
      }
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

/** Zero serious or critical axe violations (WCAG 2.0/2.1/2.2 A and AA tags). */
export async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(serious).toEqual([]);
}

type ControlWindow = { __gwTestWallet: TestWalletControl };

/** window.__gwTestWallet.setMode from the test side (undefined = every wallet). */
export async function setWalletMode(
  page: Page,
  mode: TestWalletMode,
  walletName?: string,
): Promise<void> {
  await page.evaluate(
    ([nextMode, name]) =>
      (window as unknown as ControlWindow).__gwTestWallet.setMode(nextMode, name ?? undefined),
    [mode, walletName ?? null] as const,
  );
}

export function walletSignCount(page: Page, walletName?: string): Promise<number> {
  return page.evaluate(
    (name) => (window as unknown as ControlWindow).__gwTestWallet.signCount(name ?? undefined),
    walletName ?? null,
  );
}

export async function switchWalletAccount(
  page: Page,
  walletName: string,
  index: number,
): Promise<void> {
  await page.evaluate(
    ([name, accountIndex]) =>
      (window as unknown as ControlWindow).__gwTestWallet.switchAccount(name, accountIndex),
    [walletName, index] as const,
  );
}

/** "/" → Connect wallet → (network) → the named wallet → /dashboard. */
export async function signInWith(
  page: Page,
  walletName: string,
  network: "Devnet" | "Mainnet-beta" = "Devnet",
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
  if (network === "Mainnet-beta")
    await dialog.locator("label", { hasText: "Mainnet-beta" }).click();
  await dialog.getByRole("button", { name: walletName }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
