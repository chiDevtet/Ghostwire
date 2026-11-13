# GHOST WIRE PR 02b Connect UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first designed, user-facing slice of GHOST WIRE: a design-system foundation, the app shell, the Wallet Standard connect-and-sign-in flow with every failure state handled honestly, wallet and session settings, a nonce CSP, and the three 02a backend follow-ups.

**Architecture:** Server-first shell with client islands. Server components under `src/app/**` read the session directly (`resolvePageSession`, never sliding) through one cached loader; wallet work runs in client components that call `/api/v1` through a typed client in the new client-only module `src/modules/wallet-connect` (Wallet Standard directly, a pure reducer plus an abortable driver). Primitives live in `src/ui`, feature components in `src/components`; ESLint enforces the client/server layering. Every page is dynamic so `src/proxy.ts` can give it a per-request nonce Content-Security-Policy.

**Tech Stack:** Next.js 16.4.5 (App Router, `proxy.ts`), React 19.3.1, TypeScript 6.0.3 strict, Tailwind CSS 4.3.5, Wallet Standard (`@wallet-standard/app` 1.1.1, `@solana/wallet-standard-features` 1.5.0), `zod/mini` (inside zod 4.6.7), lucide-react 1.70.0, Vitest 5.1.0 (projects `unit`, `integration`, new `ui` on happy-dom 21.0.4 + React Testing Library 16.3.3), Playwright 1.65.0 + `@axe-core/playwright` 4.14.0, MongoDB 7.0.12 in-memory replica sets. Bun 1.4.4 runs scripts; Node 24 is the runtime.

**Source documents (read the parts your task names before starting it):**
- Spec (WHAT): `docs/specs/2026-11-13-connect-ui-design.md`. Acceptance criteria are §13.
- Architecture (HOW): `docs/specs/2026-11-13-connect-ui-architecture.md`. §10.1 resolutions D1–D4 are final: D1 keep Playwright 1.65 and document `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64`; D2 add `@wallet-standard/features` 1.1.1; D3 nonce CSP, every page dynamic; D4 the link-mode copy in §3.4.
- Every code block in this plan was written, formatted with Prettier, linted, type-checked, tested and built against this repository (commit `15a7943`) in a scratch clone before the plan was written; the E2E suite (15 tests) passed against a real `next build` + `next start`. Copy code exactly. Where this plan deliberately differs from the architecture, the reason is in **Plan notes** at the end.

## Global Constraints

**Repo conventions (every task)**
- First command in a fresh checkout: `bun install --frozen-lockfile` (Task 1 Step 1). Work on branch `feat/connect-ui`.
- Run Vitest only through `bun run test` / `bun run test:unit` / `bun run test:integration` / `bun run test:ui` or `bunx vitest run --project <unit|integration|ui> <files>`. Never `bun test` (that is Bun's own runner).
- Every command that can reach the `integration` project (including plain `bun run test`) is prefixed with `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod`. An unrelated developer `mongod` listens on `localhost:27017`; nothing in this PR may connect to it.
- `bun run format` / `format:check` exit 126 on this host (Bun installs Prettier's bin with mode 0644). Format with `node node_modules/prettier/bin/prettier.cjs --write <files>` and check with `--check <files>`. `docs/` is in `.prettierignore`; `README.md` is not. The plan's code is already Prettier-formatted.
- `bun run typecheck` is `next typegen && tsc --noEmit`. `next build` (and so `bun run build`) also type-checks everything in `tsconfig.json` `include`, **tests and E2E files included**.
- Lint, typecheck and the whole Vitest suite pass at the end of every task (`bun run test:ui` exits 1 with "No test files found" until Task 9 adds the first `ui` test; that is expected and noted in Task 1).
- `git add` only the files your task lists. Never `git add -A` / `git add .`: `.agenkit/`, `.claude/`, `AGENTS.md` and `agenkit.lock.json` are untracked and not this plan's to commit.
- Each task ends with exactly one commit. Its last `-m` is the attribution trailer for the model that actually wrote the commit: `Co-Authored-By: <your model name> <noreply@anthropic.com>` (for example `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` only if that is you). Never copy a model name from this plan or an older commit.
- Exact dependency pins only (`bunfig.toml` has `exact = true`). Task 1 adds every new package; no other task adds, removes or changes a dependency.
- Modules expose a public `index.ts` and a flat `internal/`. Outside a module import only `@/modules/<name>`; tests import modules only through `@/modules/<name>`. When a task changes an existing file, the plan shows the complete new file; keep every existing export.
- Nothing runs at import time: no `loadConfig()`, no `getWallets()`, no database access at module top level. `next build` on a fresh clone with no `.env` must keep working.
- `process.env` is read only in `config`, `src/instrumentation.ts`, `src/proxy.ts`, and test setup/helpers/E2E support. No `console.*` in `src/`.
- Next 16: `cookies()` is async (`await cookies()`); `redirect()` and `notFound()` throw, so call them outside any `try` block. `middleware.ts` is now `src/proxy.ts` exporting `proxy`. Error boundaries receive `{ error, retry }` (use `retry()`, not `reset()`).
- TS 6 + DOM lib: a `Uint8Array<ArrayBufferLike>` is not a `BufferSource`; wrap it as `new Uint8Array(x)` before `crypto.subtle.*`.
- Lint runs `react-hooks` (React Compiler rules): never reassign module variables from components, never call a function named `use` outside a hook (Playwright fixtures name their callback `provide`).

**Dependencies (spec §12 + architecture §0, re-confirmed against the 7-day soak cutoff 2026-11-06)**
- Runtime: `@wallet-standard/app` `1.1.1`, `@wallet-standard/base` `1.1.1`, `@wallet-standard/features` `1.1.1` (D2), `@solana/wallet-standard-features` `1.5.0`, `lucide-react` `1.70.0`, `@fontsource-variable/inter` `5.3.0`, `@fontsource-variable/space-grotesk` `5.3.0`, `geist` `1.9.2`.
- Dev: `tailwindcss` `4.3.5`, `@tailwindcss/postcss` `4.3.5`, `@testing-library/react` `16.3.3`, `@testing-library/user-event` `14.6.8`, `happy-dom` `21.0.4`, `@playwright/test` `1.65.0`, `@axe-core/playwright` `4.14.0`.
- Never added: `@solana/web3.js`, `@solana/kit`, `@solana/wallet-adapter-*`, Radix/shadcn, `@vitejs/plugin-react`, `@testing-library/jest-dom`, `server-only`, any analytics, any CSS-in-JS. Never invent a Wallet Standard or SDK method: the only wallet calls are `standard:connect` `connect()`, `standard:events` `on("change")` and `solana:signMessage` `signMessage()`.

**Boundary rules (spec §4 + architecture §2, linted with fixture tests)**
1. Client code (`src/modules/wallet-connect/**`, `src/ui/**`, `src/components/**`) may import **only** `@/modules/validation` and `@/modules/wallet-connect` among modules (stricter than the spec's list of forbidden modules), never `mongodb`/`bson`, never `node:*`.
2. Server modules (every module except `wallet-connect`) must not import `@/modules/wallet-connect`, `@/ui/*` or `@/components/*`.
3. Only `src/app/**` may import `next/headers` and the server functions of `next/navigation` (`redirect`, `permanentRedirect`, `notFound`, `forbidden`, `unauthorized`). Client hooks (`useRouter`, `usePathname`) are allowed in client code.
4. `src/ui/**` must not import `@/modules/wallet-connect` or `@/components/*` (and `wallet-connect` never imports `@/ui/*` or `@/components/*`).
5. `bs58` may be imported only by `src/modules/wallet/internal/base58.ts` and `src/modules/wallet-connect/internal/base58.ts`; tests, helpers and E2E support keep their exemption.
- All PR 01 and 02a rules still apply. No client file imports `@/modules/auth`, not even for types: client props use the `wallet-connect` schema types (`MeData`, `WalletItem`, `SessionItem`) and the page under `src/app` that passes server data is where TypeScript checks the shapes match.

**Copy, privacy and security rules (spec §1, §5, §8, §10; product rules)**
- Never claim or imply anonymity, untraceability, or that privacy is initialized. Connecting a wallet is not privacy being set up. Where privacy limits are mentioned, say that sender and recipient addresses can remain public on Solana.
- Landing copy exactly: headline "Your money. Your business. Your privacy."; supporting line "Private SOL and USDC payments on Solana, with clear privacy boundaries."; limits sentence "Private payments are coming in a later release. Sender and recipient addresses can remain public on Solana."
- The status copy is the table in architecture §3.4 (spec §5.2 plus the D4 link-mode wording), exact strings, including "…" (U+2026). Raw API codes are never shown to users. Error pages show "Something went wrong." and at most `Reference: {digest}`, never the message or stack.
- Never collect or ask for a seed phrase or private key; the app only requests `signMessage` and never a transaction.
- No address, token, session id or wallet id in any navigation URL (path or query), `<title>`/metadata or `localStorage`/`sessionStorage`/IndexedDB; ids travel only in `/api/v1` request bodies or `/api/v1` `DELETE` paths sent with `fetch`. Every `metadata.title` is static. No analytics and no third-party requests of any kind; fonts are self-hosted; the only external links are "Get Phantom" (`https://phantom.com/download`) and "Get Solflare" (`https://solflare.com/download`) with `target="_blank" rel="noopener noreferrer"`.
- Logs never contain a token, token hash, nonce, signature, full message, IP or raw body; a 4xx log line carries `{ code, status }` only.
- Dates are shown in UTC: `Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })` + " UTC".

**CSP and headers (spec §9, architecture §3.6/§6.4, D3)**
- Page CSP from `src/proxy.ts`, one fresh 16-byte nonce per request: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. `'unsafe-eval'` only when `NODE_ENV === "development"`; production never. Never `upgrade-insecure-requests`.
- API CSP from `next.config.ts` for `/api/:path*`: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. All routes: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- The root layout calls `await connection()`, so every page (404 included) renders per request and receives the nonce.

**Design tokens (spec §6; BRAND_IDENTITY §3)**
- `--color-obsidian #09090E`, `--color-surface #111118`, `--color-elevated #17151F`, `--color-border #292936`, `--color-text #FFFFFF`, `--color-muted #A1A1AA`, `--color-silver #C4C4CE`, `--color-violet #A78BFA`, `--color-violet-hover #8B5CF6`, `--color-success #34D399`, `--color-warning #FBBF24`, `--color-error #FB7185`; `--radius-card 16px`, `--radius-control 10px`; 4px spacing scale; motion 150–250 ms. (Prettier lowercases the hex digits in `globals.css`; the colours are identical.)
- Dark theme only. Violet only for primary buttons, the selected nav item, focus rings and brand accents. Never white text on violet (2.72:1); primary buttons use obsidian text on violet.

**Accessibility (spec §6, §11; criterion 3)**
- Semantic landmarks and headings; one `<main id="main">` per page and a "Skip to content" link; visible violet focus ring (2px, offset 2px); touch targets ≥ 44px (`min-h-11`); status never conveyed by colour alone; icons always next to visible text and `aria-hidden`; keyboard operable throughout; no horizontal scroll from 320px; `prefers-reduced-motion: reduce` disables transitions and animations and the spinner becomes a static dot with its text.
- Dialog: native `<dialog>` + `showModal()`; the component itself moves focus in, traps Tab/Shift+Tab, closes on Escape and returns focus to the opener (happy-dom's `showModal()` does none of that). "Soon" nav items are `<button aria-disabled="true">`, not links. axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) must report zero serious or critical violations on every page and dialog state.

---

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `package.json`, `bun.lock`, `postcss.config.mjs`, `vitest.config.ts`, `tsconfig.json`, `.gitignore`, `.prettierignore` | Pins, `test:ui`/`test:e2e` scripts, Tailwind PostCSS, Vitest `ui` project, `.tsx` tests | 1 |
| `eslint.config.mjs`, `tests/fixtures/lint/*`, `tests/unit/lint/boundaries.test.ts` | Boundary rules R5a–R5d, R6 and their fixture tests | 1 |
| `tests/setup/ui.setup.ts`, `tests/helpers/next-navigation.ts` | RTL cleanup; shared `next/navigation` mock | 1 |
| `src/modules/shared/internal/http.ts` | 4xx log levels | 2 |
| `src/modules/auth/internal/cookies.ts`, `wrappers.ts` | Stale cookie cleared on 401 | 3 |
| `src/modules/auth/internal/{types,sessions,account,session-management,page-session}.ts` | `resolveSession(…, { slide })`, `resolvePageSession` | 4 |
| `src/modules/auth/internal/{sessions,sign-in}.ts`, `src/modules/security/internal/events.ts`, `src/app/api/v1/auth/verify/route.ts` | Old session replaced on re-sign-in | 5 |
| `src/csp.ts`, `src/proxy.ts`, `next.config.ts`, `src/app/layout.tsx` | Nonce CSP and security headers | 6 |
| `src/modules/wallet-connect/internal/{base58,errors,provider-id,challenge-preview,flow}.ts` | Pure wallet-connect pieces and the reducer | 7 |
| `src/modules/wallet-connect/internal/{schemas,api-client}.ts`, `tests/helpers/fake-api.ts` | Typed `/api/v1` client | 8 |
| `src/modules/wallet-connect/internal/{features,registry,use-wallets}.ts`, `tests/helpers/fake-wallet.ts` | Wallet discovery | 9 |
| `src/modules/wallet-connect/internal/{run-flow,use-connect-flow}.ts` | The flow driver and hook | 10 |
| `src/app/{globals.css,fonts.ts,layout.tsx}`, `src/ui/{cn,button,card,badge,spinner,ghost-logo,skip-link,date-time,network-indicator,address,toast}.*` | Tokens, fonts, display primitives | 11 |
| `src/ui/{dialog,confirm-dialog,menu,segmented-control,wallet-status}.tsx` | Interactive primitives | 12 |
| `src/components/{panel-copy,connect-wallet-copy,use-countdown,use-fresh-navigation,wallet-list,account-picker,flow-status,connect-wallet-modal,connect-button}.*` | The connect modal | 13 |
| `src/components/{wallets-panel,sessions-panel}.tsx` | Settings panels | 14 |
| `src/components/app-shell/*`, `src/components/{session-expired-handler,service-unavailable,settings-nav}.tsx` | The app shell | 15 |
| `src/app/_server/shell-state.ts`, `src/app/(app)/**`, `src/app/{page,error,not-found}.tsx` | Routes and the server loader | 16 |
| `playwright.config.ts`, `tests/e2e/support/*`, `tests/e2e/{sign-in,guards}.spec.ts`, `README.md` | E2E infrastructure, flows 1–3 and 7, CSP checks, README | 17 |
| `tests/e2e/{network-switch,wallets,sessions,mobile,a11y}.spec.ts`, `docs/adr/0007-frontend-stack-wallet-connection.md`, `docs/testing/wallet-compat.md` | Flows 4–6 and 8, axe, ADR-0007, manual checklist | 18 |

`@/modules/wallet-connect`'s `index.ts` grows in Tasks 7–10 and `@/modules/auth`'s `index.ts` in Tasks 3–5; each task shows the complete file.

---

### Task 1: Dependencies, tooling config and the client/server boundary lint rules

Architecture §0, §2, §6.1, §6.2, §6.5, §6.6. Adds every new package, the Tailwind PostCSS config, the Vitest `ui` project with its setup and `next/navigation` mock, `.tsx` tests in `tsconfig.json`, the ignore entries, and the new ESLint layering rules with fixture tests. No application code yet.

**Files:**
- Modify: `package.json` (pins and two scripts), `bun.lock` (generated), `vitest.config.ts`, `tsconfig.json`, `.gitignore`, `.prettierignore`, `eslint.config.mjs`, `tests/unit/lint/boundaries.test.ts`
- Create: `postcss.config.mjs`, `tests/setup/ui.setup.ts`, `tests/helpers/next-navigation.ts`, `tests/fixtures/lint/client-imports-server.ts`, `tests/fixtures/lint/server-imports-client.ts`, `tests/fixtures/lint/next-server-imports.ts`, `tests/fixtures/lint/ui-imports-feature.ts`, `tests/fixtures/lint/bs58-import.ts`, `tests/fixtures/lint/client-component.tsx`
- Test: `tests/unit/lint/boundaries.test.ts`

**Interfaces:**
- Consumes: the existing `eslint.config.mjs` atoms (`R1_DEEP`, `R1_REL_INTO_MODULES`, `R1_ESCAPE_1`, `R1_ESCAPE_2`, `R1_FLAT_INTERNAL`, `R2_APP`, `R3_MONGODB`, `R4_ENV`, `dynamicSelectors`, `scope`) and the existing fixtures `nested-internal.ts`, `allowed-config.ts`, `console-call.ts`, `deep-import.ts`, `env-outside-config.ts`.
- Produces: scripts `test:ui` (`vitest run --project ui`) and `test:e2e` (`playwright test`); Vitest project `ui` (happy-dom, `tests/ui/**/*.test.tsx`, setup `tests/setup/ui.setup.ts`); `tests/helpers/next-navigation.ts` exporting `routerMock: { replace, refresh, push, back, prefetch: Mock }`, `setPathname(pathname: string): void`, `resetNavigationMock(): void`, `navigationMock: { useRouter(): typeof routerMock; usePathname(): string }` (default pathname `/dashboard`; every `ui` test file mocks `next/navigation` with `vi.mock("next/navigation", async () => (await import("../../helpers/next-navigation")).navigationMock)`); lint messages `clientServer`, `clientNode`, `serverClient`, `nextServer`, `uiLayer`, `bs58` (exact strings in the config below) that later tasks' code must never trigger.

- [ ] **Step 1: Prepare the checkout and record the baseline**

Run:
```bash
cd /home/Ghostwire
git status --short --branch
bun install --frozen-lockfile
MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test
```
Expected: `## feat/connect-ui`; the only untracked entries are `.agenkit/`, `.claude/`, `AGENTS.md` and `agenkit.lock.json`; `bun install` leaves `bun.lock` unchanged; Vitest ends with `Test Files  52 passed (52)` and `Tests  681 passed (681)`. If anything differs, stop and report.

- [ ] **Step 2: Add the pinned dependencies**

Run:
```bash
bun add @wallet-standard/app@1.1.1 @wallet-standard/base@1.1.1 @wallet-standard/features@1.1.1 @solana/wallet-standard-features@1.5.0 lucide-react@1.70.0 @fontsource-variable/inter@5.3.0 @fontsource-variable/space-grotesk@5.3.0 geist@1.9.2
bun add -d tailwindcss@4.3.5 @tailwindcss/postcss@4.3.5 @testing-library/react@16.3.3 @testing-library/user-event@14.6.8 happy-dom@21.0.4 @playwright/test@1.65.0 @axe-core/playwright@4.14.0
```
Expected: both commands print `installed …` and finish without errors. Then add the two scripts so `package.json` is exactly:

Replace the whole of `package.json` with:

```json
{
  "name": "ghostwire",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.4.4",
  "engines": {
    "node": ">=24.0.0 <25"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:ui": "vitest run --project ui",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@fontsource-variable/inter": "5.3.0",
    "@fontsource-variable/space-grotesk": "5.3.0",
    "@solana/wallet-standard-features": "1.5.0",
    "@wallet-standard/app": "1.1.1",
    "@wallet-standard/base": "1.1.1",
    "@wallet-standard/features": "1.1.1",
    "bs58": "6.0.0",
    "geist": "1.9.2",
    "lucide-react": "1.70.0",
    "mongodb": "7.8.0",
    "next": "16.4.5",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.14.0",
    "@playwright/test": "1.65.0",
    "@tailwindcss/postcss": "4.3.5",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.8",
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitest/coverage-v8": "5.1.0",
    "eslint": "9.39.5",
    "eslint-config-next": "16.4.5",
    "eslint-config-prettier": "10.1.8",
    "happy-dom": "21.0.4",
    "mongodb-memory-server-core": "11.3.0",
    "prettier": "3.9.10",
    "tailwindcss": "4.3.5",
    "typescript": "6.0.3",
    "vite": "8.3.6",
    "vitest": "5.1.0"
  }
}
```

- [ ] **Step 3: Tooling config files**

Create `postcss.config.mjs`:

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };

export default config;
```

Replace the whole of `vitest.config.ts` with:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/**/*.tsx", "src/app/fonts.ts", "src/proxy.ts", "src/modules/*/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], testTimeout: 10_000 },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/integration.global.ts"],
          setupFiles: ["tests/setup/integration.setup.ts"],
          pool: "forks",
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["tests/ui/**/*.test.tsx"],
          setupFiles: ["tests/setup/ui.setup.ts"],
          testTimeout: 10_000,
        },
      },
    ],
  },
});
```

In `tsconfig.json`, add `"tests/**/*.tsx",` to `include` directly after `"tests/**/*.ts",` (nothing else changes):

```json
    "tests/**/*.ts",
    "tests/**/*.tsx",
    "*.ts",
```

In both `.gitignore` and `.prettierignore`, add these two lines directly after the existing `coverage/` line:

```text
playwright-report/
test-results/
```

Create `tests/helpers/next-navigation.ts`:

```ts
import { vi, type Mock } from "vitest";

/** Shared next/navigation router double for the ui project. */
export const routerMock: {
  readonly replace: Mock;
  readonly refresh: Mock;
  readonly push: Mock;
  readonly back: Mock;
  readonly prefetch: Mock;
} = {
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

let pathname = "/dashboard";

export function setPathname(next: string): void {
  pathname = next;
}

/** mockReset() on every routerMock fn and the pathname back to "/dashboard". */
export function resetNavigationMock(): void {
  for (const fn of Object.values(routerMock)) fn.mockReset();
  pathname = "/dashboard";
}

/**
 * Use in a test file:
 * vi.mock("next/navigation", async () => (await import("../../helpers/next-navigation")).navigationMock);
 */
export const navigationMock: {
  readonly useRouter: () => typeof routerMock;
  readonly usePathname: () => string;
} = {
  useRouter: () => routerMock,
  usePathname: () => pathname,
};
```

Create `tests/setup/ui.setup.ts`:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetNavigationMock } from "../helpers/next-navigation";

// RTL's automatic cleanup needs Vitest globals, which this repo keeps off.
afterEach(() => {
  cleanup();
  resetNavigationMock();
});
```

- [ ] **Step 4: Write the lint fixtures and the failing boundary tests**

These fixtures are linted only through `ESLint.lintText` (ESLint ignores `tests/fixtures/**` and `tsconfig.json` excludes it), so their imports need not resolve.

Create `tests/fixtures/lint/client-imports-server.ts`:

```ts
import { loadConfig } from "@/modules/config";
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import type { MeView } from "@/modules/auth";
import { SOLANA_NETWORK_IDS } from "@/modules/validation";
export const lazy = () => import("@/modules/database");
export const probe: unknown[] = [loadConfig, ObjectId, randomBytes, SOLANA_NETWORK_IDS];
export type Probe = MeView;
```

Create `tests/fixtures/lint/server-imports-client.ts`:

```ts
import { useWallets } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
import { AppShell } from "@/components/app-shell/app-shell";
export const probe = [useWallets, Button, AppShell];
```

Create `tests/fixtures/lint/next-server-imports.ts`:

```ts
import { cookies } from "next/headers";
import { notFound, redirect, useRouter } from "next/navigation";
export const lazy = () => import("next/headers");
export const probe = [cookies, notFound, redirect, useRouter];
```

Create `tests/fixtures/lint/ui-imports-feature.ts`:

```ts
import { useWallets } from "@/modules/wallet-connect";
import { ConnectButton } from "@/components/connect-button";
export const probe = [useWallets, ConnectButton];
```

Create `tests/fixtures/lint/bs58-import.ts`:

```ts
import bs58 from "bs58";
export const lazy = () => import("bs58");
export const probe = bs58;
```

Create `tests/fixtures/lint/client-component.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useWallets } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
export function Probe() {
  const router = useRouter();
  const wallets = useWallets();
  return <Button onClick={() => router.refresh()}>{wallets.length}</Button>;
}
```

Replace the boundary test with the version below. It keeps all 28 existing cases and appends the `// --- PR 02b ---` cases from architecture §2.4 (one row per fixture × virtual path):

Replace the whole of `tests/unit/lint/boundaries.test.ts` with:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const CHECKED_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-restricted-properties",
  "no-console",
]);

const MSG = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  relIntoModules: "Use '@/modules/<name>', not relative paths into src/modules.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
  flat: "internal/ must be flat; no subdirectories.",
  console: "Unexpected console statement.",
  clientServer:
    "Client code (wallet-connect, ui, components) may import only '@/modules/validation' and '@/modules/wallet-connect' among modules.",
  clientNode: "Client code (wallet-connect, ui, components) must not import 'node:*'.",
  serverClient:
    "Server modules must not import '@/modules/wallet-connect', '@/ui/*' or '@/components/*'.",
  nextServer: "Only src/app/** may import next/headers or the server functions of next/navigation.",
  uiLayer: "src/ui/** must not import '@/modules/wallet-connect' or '@/components/*'.",
  bs58: "Only wallet/internal/base58.ts and wallet-connect/internal/base58.ts may import 'bs58'.",
};

const IMPORTS = "no-restricted-imports";
const SYNTAX = "no-restricted-syntax";
const PROPS = "no-restricted-properties";
const CONSOLE = "no-console";

/** One expected violation: source line, rule id, and the message the config must produce. */
type Expected = readonly [line: number, ruleId: string, message: string];

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, "eslint.config.mjs"),
  });
});

async function boundaryMessages(
  fixture: string,
  virtualPath: string,
): Promise<Linter.LintMessage[]> {
  const code = await readFile(path.join(repoRoot, "tests/fixtures/lint", fixture), "utf8");
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, virtualPath) });
  if (result === undefined) throw new Error(`no lint result for ${fixture}`);
  expect(result.messages.filter((m) => m.fatal === true)).toEqual([]);
  return result.messages.filter((m) => m.ruleId !== null && CHECKED_RULES.has(m.ruleId));
}

describe("module boundary lint rules", { timeout: 60_000 }, () => {
  it.each<{ fixture: string; virtualPath: string; expected: Expected[] }>([
    // --- original scopes ---
    {
      fixture: "deep-import.ts",
      virtualPath: "src/app/__lint__/deep-import.ts",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    {
      fixture: "relative-escape.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "module-imports-app.ts",
      virtualPath: "src/modules/shared/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.app]],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/payments/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "tests/unit/__lint__.test.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/app/__lint__/env.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/wallet/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "allowed-database.ts",
      virtualPath: "src/modules/database/internal/__lint__.ts",
      expected: [],
    },
    {
      fixture: "allowed-config.ts",
      virtualPath: "src/modules/config/internal/__lint__.ts",
      expected: [],
    },
    { fixture: "allowed-config.ts", virtualPath: "src/instrumentation.ts", expected: [] },

    // --- fix round: files outside the named scopes still get the rules ---
    {
      fixture: "unscoped-multi.ts",
      virtualPath: "src/lib/x.ts",
      expected: [
        [1, IMPORTS, MSG.deep],
        [2, IMPORTS, MSG.mongodb],
        [3, PROPS, MSG.env],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/wallet/lib/x.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "tsx-deep.ts",
      virtualPath: "src/modules/database/internal/__lint__.tsx",
      expected: [[1, IMPORTS, MSG.deep]],
    },

    // --- fix round: dynamic import() and require() ---
    {
      fixture: "dynamic-imports.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, SYNTAX, MSG.deep],
        [2, SYNTAX, MSG.app],
      ],
    },
    {
      fixture: "require-calls.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, SYNTAX, MSG.deep],
        [2, SYNTAX, MSG.mongodb],
        [3, SYNTAX, MSG.app],
      ],
    },

    // --- fix round: the "./" prefix no longer hides a relative escape ---
    {
      fixture: "dot-escape-root.ts",
      virtualPath: "src/modules/wallet/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "dot-escape-internal.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },

    // --- fix round: remaining rules pinned once each ---
    {
      fixture: "relative-into-modules.ts",
      virtualPath: "src/app/__lint__/rel.ts",
      expected: [[1, IMPORTS, MSG.relIntoModules]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      // src/instrumentation-node.ts is under S1: it must NOT read process.env.
      fixture: "allowed-config.ts",
      virtualPath: "src/instrumentation-node.ts",
      expected: [[1, PROPS, MSG.env]],
    },

    // --- PR 02a: the auth module and the v1 route tree get the same rules (no new scope) ---
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "module-imports-app.ts",
      virtualPath: "src/modules/auth/__lint__.ts",
      expected: [[1, IMPORTS, MSG.app]],
    },
    {
      fixture: "relative-escape.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/auth/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/modules/security/internal/__lint__.ts",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      fixture: "deep-import.ts",
      virtualPath: "src/app/api/v1/__lint__/deep.ts",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    // --- PR 02b: client/server layering, next server APIs, ui layer, bs58 containment ---
    ...[
      "src/modules/wallet-connect/internal/__lint__.ts",
      "src/ui/__lint__.tsx",
      "src/components/__lint__.tsx",
    ].map((virtualPath) => ({
      fixture: "client-imports-server.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.clientServer],
        [2, IMPORTS, MSG.mongodb],
        [3, IMPORTS, MSG.clientNode],
        [4, IMPORTS, MSG.clientServer],
        [6, SYNTAX, MSG.clientServer],
      ] satisfies Expected[],
    })),
    ...[
      "src/modules/auth/internal/__lint__.ts",
      "src/modules/database/internal/__lint__.ts",
      "src/modules/config/__lint__.ts",
    ].map((virtualPath) => ({
      fixture: "server-imports-client.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.serverClient],
        [2, IMPORTS, MSG.serverClient],
        [3, IMPORTS, MSG.serverClient],
      ] satisfies Expected[],
    })),
    { fixture: "server-imports-client.ts", virtualPath: "src/app/__lint__/ok.tsx", expected: [] },
    ...[
      "src/components/__lint__.tsx",
      "src/ui/__lint__.tsx",
      "src/modules/wallet-connect/internal/__lint__.ts",
      "src/modules/auth/internal/__lint__.ts",
    ].map((virtualPath) => ({
      // Line 2 reports twice (redirect and notFound) with the same message; useRouter is allowed.
      fixture: "next-server-imports.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.nextServer],
        [2, IMPORTS, MSG.nextServer],
        [3, SYNTAX, MSG.nextServer],
      ] satisfies Expected[],
    })),
    { fixture: "next-server-imports.ts", virtualPath: "src/app/(app)/__lint__.tsx", expected: [] },
    {
      fixture: "ui-imports-feature.ts",
      virtualPath: "src/ui/__lint__.tsx",
      expected: [
        [1, IMPORTS, MSG.uiLayer],
        [2, IMPORTS, MSG.uiLayer],
      ],
    },
    { fixture: "ui-imports-feature.ts", virtualPath: "src/components/__lint__.tsx", expected: [] },
    {
      fixture: "bs58-import.ts",
      virtualPath: "src/modules/wallet/internal/base58.ts",
      expected: [],
    },
    {
      fixture: "bs58-import.ts",
      virtualPath: "src/modules/wallet-connect/internal/base58.ts",
      expected: [],
    },
    ...[
      "src/modules/wallet/internal/address.ts",
      "src/modules/wallet-connect/internal/run-flow.ts",
      "src/components/__lint__.tsx",
      "src/app/__lint__/x.ts",
    ].map((virtualPath) => ({
      fixture: "bs58-import.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.bs58],
        [2, SYNTAX, MSG.bs58],
      ] satisfies Expected[],
    })),
    { fixture: "bs58-import.ts", virtualPath: "tests/helpers/__lint__.ts", expected: [] },
    { fixture: "client-component.tsx", virtualPath: "src/components/__lint__.tsx", expected: [] },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/wallet-connect/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "allowed-config.ts",
      virtualPath: "src/modules/wallet-connect/internal/__lint__.ts",
      expected: [[1, PROPS, MSG.env]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/ui/__lint__.tsx",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      fixture: "deep-import.ts",
      virtualPath: "tests/ui/__lint__.test.tsx",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    { fixture: "env-outside-config.ts", virtualPath: "src/proxy.ts", expected: [] },
    { fixture: "env-outside-config.ts", virtualPath: "tests/e2e/__lint__.spec.ts", expected: [] },
  ])("$fixture linted as $virtualPath", async ({ fixture, virtualPath, expected }) => {
    const messages = await boundaryMessages(fixture, virtualPath);

    // Exact set of (line, ruleId) pairs, so a violation cannot move to another rule or line.
    const key = (line: number, ruleId: string | null): string => `${line}:${ruleId}`;
    const actualKeys = [...new Set(messages.map((m) => key(m.line, m.ruleId)))].sort();
    expect(actualKeys).toEqual(
      [...new Set(expected.map(([line, ruleId]) => key(line, ruleId)))].sort(),
    );

    // Every message on a (line, ruleId) is the configured one (ESLint prefixes its own text).
    for (const [line, ruleId, message] of expected) {
      const forKey = messages.filter((m) => m.line === line && m.ruleId === ruleId);
      expect(forKey.length, `${line}:${ruleId} reported`).toBeGreaterThan(0);
      for (const m of forKey) expect(m.message.endsWith(message), m.message).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the boundary test to verify the new cases fail**

Run: `bunx vitest run --project unit tests/unit/lint/boundaries.test.ts`
Expected: FAIL. The 28 original cases pass; most `PR 02b` cases fail because no rule reports `clientServer`, `serverClient`, `nextServer`, `uiLayer` or `bs58` yet (for example `client-imports-server.ts linted as src/ui/__lint__.tsx` expects `1:no-restricted-imports` and gets nothing).

- [ ] **Step 6: Add the rules to `eslint.config.mjs`**

Replace the whole file. Compared with today: six new `MESSAGES`, the R5/R6 regexes and atoms, a scope array in which every file still matches exactly one boundary scope (`wallet-connect` is carved out of S7–S9b like `database` and `config`, and each `base58.ts` has its own one-file scope), `src/proxy.ts` joins `src/instrumentation.ts` in S2, new scopes for `src/ui/**`, `src/components/**` and `tests/ui/**`, `tests/e2e/**` joins S12, and two new global ignores.

Replace the whole of `eslint.config.mjs` with:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** Unused identifiers are errors; a leading underscore marks an intentionally unused one. */
const unusedVars = {
  files: ["**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Module boundary rules (spec §4, architecture §4).
// PITFALL: in flat config a later object that sets the same rule REPLACES it (no merge).
// So every scope below emits exactly one composed entry per rule, and scopes use disjoint
// files/ignores globs. Never add a second object that sets these rules for overlapping files.
//
// ACCEPTED RESIDUAL RISKS (static linting cannot close these; decided acceptable):
//  - process.env aliasing: `const p = process; p.env`, `globalThis["process"].env`,
//    default/namespace/aliased imports of "node:process" followed by `.env`.
//  - import()/require() with a template or computed specifier (e.g. import(`mongo${"db"}`)).
// Only literal specifiers and the direct `process.env` / `globalThis.process.env` /
// `const { env } = process` / `import { env } from "node:process"` forms are enforced.
// ---------------------------------------------------------------------------

const MESSAGES = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  relIntoModules: "Use '@/modules/<name>', not relative paths into src/modules.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  flatInternal: "internal/ must be flat; no subdirectories.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
  clientServer:
    "Client code (wallet-connect, ui, components) may import only '@/modules/validation' and '@/modules/wallet-connect' among modules.",
  clientNode: "Client code (wallet-connect, ui, components) must not import 'node:*'.",
  serverClient:
    "Server modules must not import '@/modules/wallet-connect', '@/ui/*' or '@/components/*'.",
  nextServer: "Only src/app/** may import next/headers or the server functions of next/navigation.",
  uiLayer: "src/ui/** must not import '@/modules/wallet-connect' or '@/components/*'.",
  bs58: "Only wallet/internal/base58.ts and wallet-connect/internal/base58.ts may import 'bs58'.",
};

/** R1: no deep imports into a module. */
const DEEP_RE = "^@/modules/[^/]+/.+";
const APP_RE = "^@/app(/|$)";
const MONGODB_RE = "^(mongodb|bson)(/|$)";

/**
 * Selectors for dynamic import() and require() with a literal specifier, which the static
 * `patterns` option of no-restricted-imports does not see. esquery regex literals cannot
 * contain "/", so every slash is written as \x2F.
 */
function dynamicSelectors(re, message) {
  const esq = re.replaceAll("/", "\\x2F");
  return [
    { selector: `ImportExpression[source.value=/${esq}/]`, message },
    { selector: `CallExpression[callee.name='require'][arguments.0.value=/${esq}/]`, message },
  ];
}

const R1_DEEP = {
  patterns: [{ regex: DEEP_RE, message: MESSAGES.deep }],
  syntax: dynamicSelectors(DEEP_RE, MESSAGES.deep),
};
/** R1: no relative paths into src/modules from outside. */
const R1_REL_INTO_MODULES = {
  patterns: [{ regex: "^\\.{1,2}/(.+/)?modules/", message: MESSAGES.relIntoModules }],
};
/** R1: files at a module root may not climb out with ../ */
const R1_ESCAPE_1 = { patterns: [{ regex: "^(\\./)*\\.\\./", message: MESSAGES.escape }] };
/** R1: files in module/internal may not climb out with ../../ */
const R1_ESCAPE_2 = {
  patterns: [{ regex: "^(\\./)*\\.\\./(\\./)*\\.\\./", message: MESSAGES.escape }],
};
/** R1: internal/ is flat. Any file in a subdirectory is an error. */
const R1_FLAT_INTERNAL = { syntax: [{ selector: "Program", message: MESSAGES.flatInternal }] };
/** R2: modules never import the app layer. */
const R2_APP = {
  patterns: [{ regex: APP_RE, message: MESSAGES.app }],
  syntax: dynamicSelectors(APP_RE, MESSAGES.app),
};
/** R3: only database imports mongodb/bson (static, type-only, re-export and dynamic import). */
const R3_MONGODB = {
  patterns: [{ regex: MONGODB_RE, message: MESSAGES.mongodb }],
  syntax: dynamicSelectors(MONGODB_RE, MESSAGES.mongodb),
};
/** R4: only config reads process.env (member access, destructuring, import, globalThis). */
const R4_ENV = {
  properties: [{ object: "process", property: "env", message: MESSAGES.env }],
  paths: [
    { name: "process", importNames: ["env"], message: MESSAGES.env },
    { name: "node:process", importNames: ["env"], message: MESSAGES.env },
  ],
  syntax: [
    {
      selector:
        "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
      message: MESSAGES.env,
    },
    {
      selector: "MemberExpression[object.property.name='process'][property.name='env']",
      message: MESSAGES.env,
    },
  ],
};

/** R5a: client code may reach only these module entries (a deep path is R1's job). */
const CLIENT_SERVER_RE = "^@/modules/(?!(validation|wallet-connect)$)[^/]+$";
const CLIENT_NODE_RE = "^node:";
/** R5b: server modules never reach client code. */
const SERVER_CLIENT_RE = "^@/(modules/wallet-connect|ui|components)(/|$)";
/** R5d: ui is the bottom layer. */
const UI_LAYER_RE = "^@/(modules/wallet-connect|components)(/|$)";
const BS58_RE = "^bs58(/|$)";
const NEXT_HEADERS_RE = "^next/headers$";
const NEXT_SERVER_NAV = ["redirect", "permanentRedirect", "notFound", "forbidden", "unauthorized"];

const R5_CLIENT_SERVER = {
  patterns: [{ regex: CLIENT_SERVER_RE, message: MESSAGES.clientServer }],
  syntax: dynamicSelectors(CLIENT_SERVER_RE, MESSAGES.clientServer),
};
const R5_CLIENT_NODE = {
  patterns: [{ regex: CLIENT_NODE_RE, message: MESSAGES.clientNode }],
  syntax: dynamicSelectors(CLIENT_NODE_RE, MESSAGES.clientNode),
};
const R5_SERVER_CLIENT = {
  patterns: [{ regex: SERVER_CLIENT_RE, message: MESSAGES.serverClient }],
  syntax: dynamicSelectors(SERVER_CLIENT_RE, MESSAGES.serverClient),
};
/** R5c: next/headers and next/navigation's server functions only under src/app. */
const R5_NEXT_SERVER = {
  paths: [{ name: "next/navigation", importNames: NEXT_SERVER_NAV, message: MESSAGES.nextServer }],
  patterns: [{ regex: NEXT_HEADERS_RE, message: MESSAGES.nextServer }],
  syntax: dynamicSelectors(NEXT_HEADERS_RE, MESSAGES.nextServer),
};
const R5_UI_LAYER = {
  patterns: [{ regex: UI_LAYER_RE, message: MESSAGES.uiLayer }],
  syntax: dynamicSelectors(UI_LAYER_RE, MESSAGES.uiLayer),
};
/** R6: bs58 is contained in the two base58.ts files. */
const R6_BS58 = {
  patterns: [{ regex: BS58_RE, message: MESSAGES.bs58 }],
  syntax: dynamicSelectors(BS58_RE, MESSAGES.bs58),
};

/**
 * Emits ONE config object with at most one entry each for no-restricted-imports,
 * no-restricted-syntax and no-restricted-properties, composed from the given atoms.
 */
function scope(files, ignores, atoms, { noConsole = false } = {}) {
  const paths = atoms.flatMap((atom) => atom.paths ?? []);
  const patterns = atoms.flatMap((atom) => atom.patterns ?? []);
  const syntax = atoms.flatMap((atom) => atom.syntax ?? []);
  const properties = atoms.flatMap((atom) => atom.properties ?? []);
  const rules = {};
  if (paths.length > 0 || patterns.length > 0) {
    const options = {};
    if (paths.length > 0) options.paths = paths;
    if (patterns.length > 0) options.patterns = patterns;
    rules["no-restricted-imports"] = ["error", options];
  }
  if (syntax.length > 0) rules["no-restricted-syntax"] = ["error", ...syntax];
  if (properties.length > 0) rules["no-restricted-properties"] = ["error", ...properties];
  if (noConsole) rules["no-console"] = "error";
  return ignores.length > 0 ? { files, ignores, rules } : { files, rules };
}

const SRC = { noConsole: true };
const WC = "src/modules/wallet-connect";
/** Modules with their own scopes; excluded from the generic module scopes S7-S9b. */
const SPECIAL_MODULES = ["src/modules/{database,config,wallet-connect}/**"];
/** The two files allowed to import bs58; each has its own scope (S8a, S14a). */
const BS58_FILES = ["src/modules/wallet/internal/base58.ts", `${WC}/internal/base58.ts`];
/** Files under src/modules already claimed by the module root / internal / nested-internal scopes. */
const MODULE_SCOPED_FILES = [
  "src/modules/*/*.{ts,tsx}",
  "src/modules/*/internal/*.{ts,tsx}",
  "src/modules/*/internal/*/**/*.{ts,tsx}",
];
/** Atoms every server module scope adds (S3-S9b). */
const SERVER = [R5_SERVER_CLIENT, R5_NEXT_SERVER, R6_BS58];
/** Atoms every client scope adds (wallet-connect, ui, components). */
const CLIENT = [R5_CLIENT_SERVER, R5_CLIENT_NODE, R5_NEXT_SERVER, R6_BS58];

const boundaryScopes = [
  // S1 app + other root src files (instrumentation and proxy have their own scope)
  scope(
    ["src/app/**/*.{ts,tsx}", "src/*.{ts,tsx}"],
    ["src/instrumentation.ts", "src/proxy.ts"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R6_BS58],
    SRC,
  ),
  // S2 Next runtime files: process.env allowed
  scope(
    ["src/instrumentation.ts", "src/proxy.ts"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R6_BS58],
    SRC,
  ),
  // S0 catch-all for any other src file (src/lib, ...): base rules
  scope(
    ["src/**/*.{ts,tsx}"],
    ["src/app/**", "src/*.{ts,tsx}", "src/modules/**", "src/ui/**", "src/components/**"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_NEXT_SERVER, R6_BS58],
    SRC,
  ),
  // S3/S4 database: mongodb allowed
  scope(
    ["src/modules/database/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/internal/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  // S5/S6 config: process.env allowed
  scope(
    ["src/modules/config/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/internal/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S7/S8 every other server module. These globs cover every server module except database,
  // config and wallet-connect, which have their own scopes. A second scope for the same files
  // would REPLACE these rules (see PITFALL above), not add to them.
  scope(
    ["src/modules/*/*.{ts,tsx}"],
    SPECIAL_MODULES,
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/*/internal/*.{ts,tsx}"],
    [...SPECIAL_MODULES, ...BS58_FILES],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  // S8a wallet/internal/base58.ts: S8 minus R6
  scope(
    ["src/modules/wallet/internal/base58.ts"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_SERVER_CLIENT, R5_NEXT_SERVER],
    SRC,
  ),
  // S9 nested internal directories are forbidden outright (and still get the module rules)
  scope(
    ["src/modules/*/internal/*/**/*.{ts,tsx}"],
    SPECIAL_MODULES,
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/internal/*/**/*.{ts,tsx}"],
    [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/internal/*/**/*.{ts,tsx}"],
    [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S9b catch-all for any other file under src/modules (module/lib/x.ts, modules/x.ts, ...):
  // module rules; a depth-1 subdirectory may not climb into another module.
  scope(
    ["src/modules/**/*.{ts,tsx}"],
    [...MODULE_SCOPED_FILES, ...SPECIAL_MODULES],
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/**/*.{ts,tsx}"],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/**/*.{ts,tsx}"],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S13/S14/S15/S16 wallet-connect: the client module (S7-S9b shapes, CLIENT atoms instead of SERVER)
  scope(
    [`${WC}/*.{ts,tsx}`],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT],
    SRC,
  ),
  scope(
    [`${WC}/internal/*.{ts,tsx}`],
    [`${WC}/internal/base58.ts`],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT],
    SRC,
  ),
  // S14a wallet-connect/internal/base58.ts: S14 minus R6
  scope(
    [`${WC}/internal/base58.ts`],
    [],
    [
      R1_DEEP,
      R1_ESCAPE_2,
      R2_APP,
      R3_MONGODB,
      R4_ENV,
      R5_UI_LAYER,
      R5_CLIENT_SERVER,
      R5_CLIENT_NODE,
      R5_NEXT_SERVER,
    ],
    SRC,
  ),
  scope(
    [`${WC}/internal/*/**/*.{ts,tsx}`],
    [],
    [
      R1_FLAT_INTERNAL,
      R1_DEEP,
      R1_REL_INTO_MODULES,
      R2_APP,
      R3_MONGODB,
      R4_ENV,
      R5_UI_LAYER,
      ...CLIENT,
    ],
    SRC,
  ),
  scope(
    [`${WC}/**/*.{ts,tsx}`],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT],
    SRC,
  ),
  // S17 ui primitives: client, and the bottom layer
  scope(
    ["src/ui/**/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT],
    SRC,
  ),
  // S18 feature components: client (may use ui and wallet-connect)
  scope(
    ["src/components/**/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, ...CLIENT],
    SRC,
  ),
  // S10 unit tests
  scope(["tests/unit/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S10a component tests (happy-dom)
  scope(["tests/ui/**/*.{ts,tsx}"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S11 integration tests: mongodb allowed (labelled MongoErrors, ClientSession spies)
  scope(["tests/integration/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R4_ENV]),
  // S12 test setup, helpers and E2E: process.env allowed
  scope(
    ["tests/setup/**/*.{ts,tsx}", "tests/helpers/**/*.{ts,tsx}", "tests/e2e/**/*.ts"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES],
  ),
];
// Root config files (*.config.ts, eslint.config.mjs) are deliberately unscoped: they are the
// spec's "Next/tooling config files" exception.

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    "tests/fixtures/**",
    ".agenkit/**",
    ".claude/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  ...nextVitals,
  ...nextTs,
  unusedVars,
  ...boundaryScopes,
  prettier,
]);
```

- [ ] **Step 7: Run the boundary test to verify it passes**

Run: `bunx vitest run --project unit tests/unit/lint/boundaries.test.ts`
Expected: PASS, `Tests  56 passed (56)`.
What would make it fail: deleting `R6_BS58` from any scope (the `bs58-import.ts` rows), dropping `CLIENT` from the `src/ui/**` scope, or adding `src/modules/wallet-connect/**` back into the generic S7/S8 globs (the scopes would overlap and the later one would replace the earlier rules).

- [ ] **Step 8: Full gate**

Run:
```bash
bun run lint
bun run typecheck
MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test
node node_modules/prettier/bin/prettier.cjs --check package.json postcss.config.mjs vitest.config.ts tsconfig.json eslint.config.mjs tests/setup/ui.setup.ts tests/helpers/next-navigation.ts tests/unit/lint/boundaries.test.ts
bun run test:ui; echo "exit $?"
```
Expected: lint exits 0 with no output after the command line; typecheck prints `✓ Types generated successfully`; Vitest `Tests  709 passed (709)`; Prettier `All matched files use Prettier code style!`; `bun run test:ui` prints `No test files found` and `exit 1` (expected until Task 9 adds the first `ui` test).

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock postcss.config.mjs vitest.config.ts tsconfig.json .gitignore .prettierignore eslint.config.mjs tests/setup/ui.setup.ts tests/helpers/next-navigation.ts tests/fixtures/lint/client-imports-server.ts tests/fixtures/lint/server-imports-client.ts tests/fixtures/lint/next-server-imports.ts tests/fixtures/lint/ui-imports-feature.ts tests/fixtures/lint/bs58-import.ts tests/fixtures/lint/client-component.tsx tests/unit/lint/boundaries.test.ts
git commit -m "build: add PR 02b dependencies, ui test project and client/server lint rules" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 2: Log 4xx responses at warn (UNAUTHENTICATED at debug) instead of error

Spec §7.1, architecture §5.1. Only the logging in `toErrorResponse` changes; the response mapping is identical.

**Files:**
- Modify: `src/modules/shared/internal/http.ts`, `tests/unit/shared/http.test.ts`
- Create: `tests/integration/routes/v1/log-levels.test.ts`
- Test: both test files

**Interfaces:**
- Consumes: `toErrorResponse(error: unknown): Response`, `logger` (`debug|info|warn|error(msg, fields?)`), `isAppError`, `AppError.httpStatus`/`.code`; test helpers `captureLogLines()` (`tests/helpers/logs.ts`), `startStandalone()`/`useDatabaseUri()` (`tests/helpers/mongo.ts`), `signIn()`/`verify()` (`tests/helpers/auth.ts`), `TestClient` (`tests/helpers/http.ts`).
- Produces: the same signature. Log lines: unknown throws → `error "request failed" { err, code: "INTERNAL" }`; status ≥ 500 → `error "request failed" { err, code }`; `UNAUTHENTICATED` → `debug "request rejected" { code, status }`; any other status < 500 → `warn "request rejected" { code, status }` (no `err`, so no stack).

- [ ] **Step 1: Write the failing unit tests**

Replace the whole file (the 4xx rows move to a new `it.each` that expects `warn`; `AUTH_FAILED` and `UNAUTHENTICATED` cases are added; the 5xx and unknown-throw cases are unchanged):

Replace the whole of `tests/unit/shared/http.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  AuthFailedError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
  logger,
  noContent,
  noStoreJson,
  toErrorResponse,
} from "@/modules/shared";

const SENTINEL = "SENTINEL-INTERNAL-DETAIL";

describe("noStoreJson", () => {
  it("serializes the body with no-store and JSON content type", async () => {
    const res = noStoreJson({ status: "ok" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("applies status and extra headers but never drops no-store", () => {
    const res = noStoreJson(
      { a: 1 },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "max-age=60" } },
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serializes bigint values as decimal strings, nested or top level (entry gate 6)", async () => {
    const res = noStoreJson({ amount: 18446744073709551616n, nested: { list: [1n, 2] } });
    expect(await res.text()).toBe('{"amount":"18446744073709551616","nested":{"list":["1",2]}}');
    expect(await noStoreJson(5n).text()).toBe('"5"');
  });
});

describe("noContent", () => {
  it("returns 204 with no body and no-store", async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("applies extra headers, including Set-Cookie, but never drops no-store", () => {
    const res = noContent({
      headers: { "Set-Cookie": "a=; Max-Age=0", "Cache-Control": "public" },
    });
    expect(res.headers.getSetCookie()).toEqual(["a=; Max-Age=0"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

function silenceLoggerError() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

function silenceLoggerWarn() {
  return vi.spyOn(logger, "warn").mockImplementation(() => undefined);
}

function silenceLoggerDebug() {
  return vi.spyOn(logger, "debug").mockImplementation(() => undefined);
}

describe("toErrorResponse", () => {
  it.each([
    {
      error: new ValidationError({ message: SENTINEL }),
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Invalid request",
    },
    {
      error: new NotFoundError({ message: SENTINEL }),
      status: 404,
      code: "NOT_FOUND",
      message: "Not found",
    },
    {
      error: new ConflictError({ message: SENTINEL }),
      status: 409,
      code: "CONFLICT",
      message: "Conflict",
    },
    {
      error: new AuthFailedError("signature_invalid", { message: SENTINEL }),
      status: 401,
      code: "AUTH_FAILED",
      message: "Authentication failed",
    },
  ])(
    "maps $code to $status with only the safe message and logs warn { code, status } (no err)",
    async ({ error, status, code, message }) => {
      const logError = silenceLoggerError();
      const logWarn = silenceLoggerWarn();
      const res = toErrorResponse(error);
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code, message });
      expect(text).not.toContain(SENTINEL);
      expect(logWarn).toHaveBeenCalledExactlyOnceWith("request rejected", { code, status });
      expect(logError).not.toHaveBeenCalled();
    },
  );

  it("logs UNAUTHENTICATED at debug with { code, status } only", async () => {
    const logError = silenceLoggerError();
    const logWarn = silenceLoggerWarn();
    const logDebug = silenceLoggerDebug();
    const res = toErrorResponse(new UnauthenticatedError());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
    expect(logDebug).toHaveBeenCalledExactlyOnceWith("request rejected", {
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new DependencyUnavailableError("database", { message: SENTINEL }),
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
      logged: "DEPENDENCY_UNAVAILABLE",
    },
    {
      error: new InternalError({ message: SENTINEL }),
      status: 500,
      code: "INTERNAL",
      message: "Internal error",
      logged: "INTERNAL",
    },
    {
      error: new ConfigError([{ key: SENTINEL, reason: "Required" }]),
      status: 500,
      code: "INTERNAL",
      message: "Internal error",
      logged: "CONFIG_INVALID",
    },
  ])(
    "maps $logged to $status $code with only the safe message",
    async ({ error, status, code, message, logged }) => {
      const logError = silenceLoggerError();
      const res = toErrorResponse(error);
      expect(res.status).toBe(status);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code, message });
      expect(text).not.toContain(SENTINEL);
      expect(text).not.toContain("stack");
      expect(logError).toHaveBeenCalledWith("request failed", { err: error, code: logged });
    },
  );

  it.each([
    { label: "DATA_INTEGRITY", error: new InternalError({ code: "DATA_INTEGRITY" }) },
    { label: "INDEX_CONFLICT", error: new InternalError({ code: "INDEX_CONFLICT" }) },
    {
      label: "a custom 502",
      error: new AppError({ code: "UPSTREAM_BROKEN", httpStatus: 502, safeMessage: "Bad gateway" }),
    },
  ])(
    "collapses $label to 500 INTERNAL and logs the original code (entry gate 5)",
    async ({ error }) => {
      const logError = silenceLoggerError();
      const res = toErrorResponse(error);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ code: "INTERNAL", message: "Internal error" });
      expect(res.headers.get("retry-after")).toBeNull();
      expect(logError).toHaveBeenCalledWith("request failed", { err: error, code: error.code });
    },
  );

  it("keeps DEPENDENCY_UNAVAILABLE as a 503 with Retry-After (not collapsed)", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new DependencyUnavailableError("database"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(await res.json()).toEqual({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
    });
  });

  it("adds Retry-After only for DependencyUnavailableError", () => {
    silenceLoggerError();
    silenceLoggerWarn();
    expect(
      toErrorResponse(new DependencyUnavailableError("database")).headers.get("retry-after"),
    ).toBe("5");
    expect(toErrorResponse(new NotFoundError()).headers.get("retry-after")).toBeNull();
    expect(toErrorResponse(new InternalError()).headers.get("retry-after")).toBeNull();
  });

  it("maps RateLimitedError to 429 with Retry-After set to its seconds", async () => {
    const logError = silenceLoggerError();
    const logWarn = silenceLoggerWarn();
    const error = new RateLimitedError(42);
    const res = toErrorResponse(error);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ code: "RATE_LIMITED", message: "Too many requests" });
    expect(logWarn).toHaveBeenCalledExactlyOnceWith("request rejected", {
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("maps unknown errors and non-Error throws to a generic 500", async () => {
    const logError = silenceLoggerError();
    for (const thrown of [new Error(SENTINEL), SENTINEL, { message: SENTINEL }]) {
      const res = toErrorResponse(thrown);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code: "INTERNAL", message: "Internal error" });
      expect(text).not.toContain(SENTINEL);
    }
    expect(logError).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenLastCalledWith("request failed", {
      err: { message: SENTINEL },
      code: "INTERNAL",
    });
  });

  it("keeps cause out of the response", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new InternalError({ cause: new Error(SENTINEL) }));
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/routes/v1/log-levels.test.ts`:

```ts
import { afterEach, describe, expect, inject, it } from "vitest";
import * as challengeRoute from "@/app/api/v1/auth/challenge/route";
import * as meRoute from "@/app/api/v1/me/route";
import { signIn, verify } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { captureLogLines, type CapturedLogs } from "../../../helpers/logs";
import { startStandalone, useDatabaseUri } from "../../../helpers/mongo";

interface LogLine {
  readonly level: string;
  readonly msg: string;
  readonly [key: string]: unknown;
}

let capture: CapturedLogs | null = null;

afterEach(async () => {
  capture?.restore();
  capture = null;
  await useDatabaseUri(inject("mongoUri"));
});

function parsed(logs: CapturedLogs): LogLine[] {
  return logs.lines().map((line) => JSON.parse(line) as LogLine);
}

/** Lines written by toErrorResponse (the only writer of these two messages). */
function responseLines(logs: CapturedLogs): LogLine[] {
  return parsed(logs).filter((l) => l.msg === "request rejected" || l.msg === "request failed");
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

function postChallenge(client: TestClient, body: unknown, origin?: string) {
  return client.call(challengeRoute.POST, {
    method: "POST",
    path: "/api/v1/auth/challenge",
    body,
    ...(origin === undefined ? {} : { origin }),
  });
}

describe("toErrorResponse log levels through the routes (spec §7.1)", () => {
  it("logs a 401 UNAUTHENTICATED at debug with { code, status } and no error line", async () => {
    capture = captureLogLines();
    const result = await new TestClient().call(meRoute.GET, { method: "GET", path: "/api/v1/me" });
    expect(result.status).toBe(401);
    const lines = responseLines(capture);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "debug",
      msg: "request rejected",
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(lines.some((l) => l.level === "error")).toBe(false);
  });

  it("logs a 403 ORIGIN_REJECTED at warn with no err or stack", async () => {
    capture = captureLogLines();
    const body = { address: createTestWallet().address, network: "devnet" };
    const result = await postChallenge(new TestClient(), body, "https://evil.test");
    expect(result.status).toBe(403);
    const [line, ...rest] = responseLines(capture);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ level: "warn", code: "ORIGIN_REJECTED", status: 403 });
    expect(line).not.toHaveProperty("err");
    expect(JSON.stringify(line)).not.toContain("stack");
  });

  it("logs a 400 VALIDATION_FAILED at warn", async () => {
    capture = captureLogLines();
    const result = await postChallenge(new TestClient(), { address: "0OIl", network: "devnet" });
    expect(result.status).toBe(400);
    const [line] = responseLines(capture);
    expect(line).toMatchObject({ level: "warn", code: "VALIDATION_FAILED", status: 400 });
    expect(line).not.toHaveProperty("err");
  });

  it("logs a replayed challenge (401 AUTH_FAILED) at warn, not debug", async () => {
    const signedIn = await signIn(new TestClient(), createTestWallet());
    capture = captureLogLines();
    const replay = await verify(new TestClient(), signedIn.challenge, signedIn.signature);
    expect(replay.status).toBe(401);
    const lines = responseLines(capture);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", code: "AUTH_FAILED", status: 401 });
    expect(lines[0]).not.toHaveProperty("err");
  });

  it("logs a 503 (database down) at error with the err object", async () => {
    await useDatabaseUri(await stoppedUri());
    capture = captureLogLines();
    const body = { address: createTestWallet().address, network: "devnet" };
    const result = await postChallenge(new TestClient(), body);
    expect(result.status).toBe(503);
    const errorLines = responseLines(capture).filter((l) => l.level === "error");
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toMatchObject({ msg: "request failed", code: "DEPENDENCY_UNAVAILABLE" });
    expect(errorLines[0]).toHaveProperty("err");
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/unit/shared/http.test.ts tests/integration/routes/v1/log-levels.test.ts`
Expected: FAIL. Unit: the four `logs warn { code, status } (no err)` cases, the `UNAUTHENTICATED at debug` case and the `RateLimitedError` case fail (6 failures; today every handled error logs at `error`). Integration: 4 of 5 fail (only the 503 case passes).

- [ ] **Step 4: Implement**

Replace the whole of `src/modules/shared/internal/http.ts` with:

```ts
import { DependencyUnavailableError, RateLimitedError, isAppError } from "./errors";
import { logger } from "./logger";

const RETRY_AFTER_SECONDS = "5";
const INTERNAL_BODY = { code: "INTERNAL", message: "Internal error" } as const;

/** JSON.stringify replacer: bigint becomes its decimal string (JSON has no bigint). */
function bigintAsString(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function noStoreJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, bigintAsString), {
    status: init.status ?? 200,
    headers,
  });
}

/** 204 with Cache-Control: no-store and no body (a 204 Response cannot carry a body). */
export function noContent(init: { headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 204, headers });
}

/**
 * Maps any thrown value to a safe response; the client only ever sees a stable code and safe
 * message. Logging by status class: unknown throws and every status >= 500 log at error with the
 * error object (original code kept); UNAUTHENTICATED (401) logs at debug; every other status
 * below 500 logs at warn with { code, status } only (no err, so no stack). Every status >= 500
 * collapses to INTERNAL, except DependencyUnavailableError, which keeps its 503 code and
 * Retry-After. RateLimitedError adds Retry-After with its own seconds.
 */
export function toErrorResponse(error: unknown): Response {
  if (!isAppError(error)) {
    logger.error("request failed", { err: error, code: "INTERNAL" });
    return noStoreJson(INTERNAL_BODY, { status: 500 });
  }
  const status = error.httpStatus;
  if (status >= 500) logger.error("request failed", { err: error, code: error.code });
  else if (error.code === "UNAUTHENTICATED")
    logger.debug("request rejected", { code: error.code, status });
  else logger.warn("request rejected", { code: error.code, status });
  if (error instanceof DependencyUnavailableError) {
    return noStoreJson(
      { code: error.code, message: error.safeMessage },
      { status, headers: { "Retry-After": RETRY_AFTER_SECONDS } },
    );
  }
  if (status >= 500) return noStoreJson(INTERNAL_BODY, { status: 500 });
  const headers: Record<string, string> =
    error instanceof RateLimitedError ? { "Retry-After": String(error.retryAfterSeconds) } : {};
  return noStoreJson({ code: error.code, message: error.safeMessage }, { status, headers });
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/unit/shared/http.test.ts tests/integration/routes/v1/log-levels.test.ts`
Expected: PASS, `Tests  26 passed`.
What would make it fail: logging 4xx with `{ err: error }` (the `not.toHaveProperty("err")` assertions), or logging `UNAUTHENTICATED` at `warn` (the debug-only assertion).

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: lint and typecheck clean; `Tests  716 passed (716)`. Some unit tests now print `"level":"warn","msg":"request rejected"` JSON lines to stderr; that is expected.

- [ ] **Step 7: Commit**

```bash
git add src/modules/shared/internal/http.ts tests/unit/shared/http.test.ts tests/integration/routes/v1/log-levels.test.ts
git commit -m "fix(shared): log 4xx at warn and UNAUTHENTICATED at debug without stacks" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 3: Clear a stale session cookie on 401

Spec §7.2, architecture §5.2. When a request carried a session cookie (either name, any non-empty value) and no session resolved, the 401 also clears the configured cookie. No cookie → no `Set-Cookie`. A database outage stays a 503 with no clear.

**Files:**
- Modify: `src/modules/auth/internal/cookies.ts`, `src/modules/auth/internal/wrappers.ts`, `src/modules/auth/index.ts`, `tests/unit/auth/cookies.test.ts`
- Create: `tests/integration/routes/v1/stale-cookie.test.ts`
- Test: both test files

**Interfaces:**
- Consumes: `sessionCookieName(appOrigin): SessionCookieName`, `clearSessionCookie(appOrigin): string`, `readSessionToken(request, appOrigin): string | null`, `withSession(handler)`, `resolveSession(token, at)`, `toErrorResponse`, `UnauthenticatedError`; helpers `TestClient` (`setCookie`, `cookie`, `call`), `TEST_APP_ORIGIN`, `useEnv`, `signIn`.
- Produces (exported from `@/modules/auth`): `parseSessionTokenValue(value: string | undefined): string | null` (the value when it matches `/^[A-Za-z0-9_-]{43}$/`, else `null`; Task 4 uses it) and `carriesSessionCookie(request: Request): boolean`. `readSessionToken` keeps its behaviour.

- [ ] **Step 1: Write the failing unit tests**

Replace the whole file (adds the `parseSessionTokenValue` and `carriesSessionCookie` describes):

Replace the whole of `tests/unit/auth/cookies.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "@/modules/auth";

const HTTPS = "https://ghostwire.test";
const HTTP = "http://localhost:3000";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_-";
const OTHER = "Z".repeat(43);

function withCookie(cookie: string): Request {
  return new Request(`${HTTPS}/api/v1/me`, { headers: { cookie } });
}

describe("session cookie strings", () => {
  it("uses __Host-gw_session with Secure for an https origin", () => {
    expect(sessionCookieName(HTTPS)).toBe("__Host-gw_session");
    expect(buildSessionCookie(TOKEN, 604_800, HTTPS)).toBe(
      `__Host-gw_session=${TOKEN}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(clearSessionCookie(HTTPS)).toBe(
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("uses gw_session without Secure for an http origin", () => {
    expect(sessionCookieName(HTTP)).toBe("gw_session");
    expect(buildSessionCookie(TOKEN, 60, HTTP)).toBe(
      `gw_session=${TOKEN}; Path=/; Max-Age=60; HttpOnly; SameSite=Lax`,
    );
    expect(clearSessionCookie(HTTP)).toBe("gw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });
});

describe("readSessionToken", () => {
  it("reads the configured cookie among others", () => {
    expect(readSessionToken(withCookie(`a=1; __Host-gw_session=${TOKEN}; b=2`), HTTPS)).toBe(TOKEN);
  });

  it("ignores the other name for the configured origin", () => {
    expect(readSessionToken(withCookie(`gw_session=${TOKEN}`), HTTPS)).toBeNull();
    expect(readSessionToken(withCookie(`__Host-gw_session=${TOKEN}`), HTTP)).toBeNull();
    expect(readSessionToken(withCookie(`gw_session=${TOKEN}`), HTTP)).toBe(TOKEN);
  });

  it.each([
    "__Host-gw_session=short",
    `__Host-gw_session=${TOKEN}x`,
    `__Host-gw_session=${TOKEN.slice(0, 42)}!`,
    "__Host-gw_session=",
    "__Host-gw_session",
  ])("ignores a malformed value: %s", (cookie) => {
    expect(readSessionToken(withCookie(cookie), HTTPS)).toBeNull();
  });

  it("takes the first well-formed duplicate", () => {
    const cookie = `__Host-gw_session=bad; __Host-gw_session=${TOKEN}; __Host-gw_session=${OTHER}`;
    expect(readSessionToken(withCookie(cookie), HTTPS)).toBe(TOKEN);
  });

  it("returns null without a Cookie header", () => {
    expect(readSessionToken(new Request(`${HTTPS}/x`), HTTPS)).toBeNull();
  });
});

describe("parseSessionTokenValue", () => {
  it("returns a well-formed token unchanged", () => {
    expect(parseSessionTokenValue(TOKEN)).toBe(TOKEN);
  });

  it.each([undefined, "", "short", `${TOKEN}x`, `${TOKEN.slice(0, 42)}!`])(
    "returns null for %s",
    (value) => {
      expect(parseSessionTokenValue(value)).toBeNull();
    },
  );
});

describe("carriesSessionCookie", () => {
  it.each([
    `__Host-gw_session=${TOKEN}`,
    "gw_session=anything",
    "a=1; __Host-gw_session=malformed; b=2",
    "gw_session=x",
  ])("is true for %s", (cookie) => {
    expect(carriesSessionCookie(withCookie(cookie))).toBe(true);
  });

  it.each(["__Host-gw_session=", "gw_session=", "a=1; b=2", "gw_session", "x_gw_session=abc"])(
    "is false for %s",
    (cookie) => {
      expect(carriesSessionCookie(withCookie(cookie))).toBe(false);
    },
  );

  it("is false without a Cookie header", () => {
    expect(carriesSessionCookie(new Request(`${HTTPS}/x`))).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/routes/v1/stale-cookie.test.ts`:

```ts
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import { clearSessionCookie } from "@/modules/auth";
import { logger } from "@/modules/shared";
import { signIn } from "../../../helpers/auth";
import { createTestWallet } from "../../../helpers/ed25519";
import { useEnv } from "../../../helpers/env";
import { TEST_APP_ORIGIN, TestClient } from "../../../helpers/http";
import { startStandalone, useDatabaseUri } from "../../../helpers/mongo";

const HTTP_ORIGIN = "http://127.0.0.1:3210";
const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Authentication required" };

let restoreEnv: (() => void) | null = null;

afterEach(async () => {
  restoreEnv?.();
  restoreEnv = null;
  await useDatabaseUri(inject("mongoUri"));
});

function getMe(client: TestClient, headers?: Record<string, string>) {
  return client.call(meRoute.GET, { method: "GET", path: "/api/v1/me", headers });
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

describe("withSession clears a stale session cookie on 401 (spec §7.2)", () => {
  it("clears the cookie of a logged-out session", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const token = client.cookie;
    expect(
      (await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" })).status,
    ).toBe(204);
    client.setCookie(token);
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.json).toEqual(UNAUTHENTICATED);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
    expect(client.cookie).toBeNull();
  });

  it("clears a malformed cookie value without a database lookup", async () => {
    const client = new TestClient();
    client.setCookie("not-a-token");
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
  });

  it("clears the cookie of a revoked session on another route", async () => {
    const phone = new TestClient();
    await signIn(phone, createTestWallet());
    const token = phone.cookie;
    await phone.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    const other = new TestClient();
    other.setCookie(token);
    const result = await other.call(sessionsRoute.GET, { method: "GET", path: "/api/v1/sessions" });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([clearSessionCookie(TEST_APP_ORIGIN)]);
  });

  it("clears the configured name when only the other cookie name is sent", async () => {
    const result = await getMe(new TestClient(), { cookie: `gw_session=${"a".repeat(43)}` });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([
      "__Host-gw_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("clears gw_session (no Secure) for an http:// APP_ORIGIN", async () => {
    restoreEnv = useEnv({ APP_ORIGIN: HTTP_ORIGIN });
    const client = new TestClient({ appOrigin: HTTP_ORIGIN });
    client.setCookie("b".repeat(43));
    const result = await getMe(client);
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual(["gw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"]);
  });

  it("sends no Set-Cookie when the request had no session cookie", async () => {
    const result = await getMe(new TestClient(), { cookie: "theme=dark" });
    expect(result.status).toBe(401);
    expect(result.setCookies).toEqual([]);
    const bare = await getMe(new TestClient());
    expect(bare.status).toBe(401);
    expect(bare.setCookies).toEqual([]);
  });

  it("returns 503 and keeps the cookie when the database is down", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    await useDatabaseUri(await stoppedUri());
    const result = await getMe(client);
    expect(result.status).toBe(503);
    expect(result.setCookies).toEqual([]);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/unit/auth/cookies.test.ts tests/integration/routes/v1/stale-cookie.test.ts`
Expected: FAIL. The unit file fails to import (`parseSessionTokenValue` / `carriesSessionCookie` are not exported); in the integration file the five "clears …" cases fail (`setCookies` is `[]`), while "no Set-Cookie without a cookie" and the 503 case pass.

- [ ] **Step 4: Implement**

Replace the whole of `src/modules/auth/internal/cookies.ts` with:

```ts
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SECONDS_PER_DAY = 86_400;

export type SessionCookieName = "__Host-gw_session" | "gw_session";

const BOTH_NAMES: readonly string[] = ["__Host-gw_session", "gw_session"];

/** https origins get the __Host- prefix (and Secure); http (local dev only) gets gw_session. */
export function sessionCookieName(appOrigin: string): SessionCookieName {
  return appOrigin.startsWith("https://") ? "__Host-gw_session" : "gw_session";
}

function attributes(appOrigin: string, maxAgeSeconds: number): string {
  const secure = appOrigin.startsWith("https://") ? "; Secure" : "";
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secure}; SameSite=Lax`;
}

export function buildSessionCookie(
  token: string,
  maxAgeSeconds: number,
  appOrigin: string,
): string {
  return `${sessionCookieName(appOrigin)}=${token}; ${attributes(appOrigin, maxAgeSeconds)}`;
}

/** The same name and attributes with an empty value and Max-Age=0. */
export function clearSessionCookie(appOrigin: string): string {
  return `${sessionCookieName(appOrigin)}=; ${attributes(appOrigin, 0)}`;
}

/** The value when it is a 43-char base64url session token, else null. */
export function parseSessionTokenValue(value: string | undefined): string | null {
  return value !== undefined && TOKEN_PATTERN.test(value) ? value : null;
}

/** [name, value] for every "name=value" pair of the Cookie header (pairs without "=" skipped). */
function cookiePairs(request: Request): [string, string][] {
  const header = request.headers.get("cookie");
  if (header === null) return [];
  const pairs: [string, string][] = [];
  for (const part of header.split(";")) {
    const pair = part.trim();
    const eq = pair.indexOf("=");
    if (eq !== -1) pairs.push([pair.slice(0, eq), pair.slice(eq + 1)]);
  }
  return pairs;
}

/**
 * The first cookie with the configured name whose value is a 43-char base64url token, else null.
 * Malformed values never reach the database.
 */
export function readSessionToken(request: Request, appOrigin: string): string | null {
  const name = sessionCookieName(appOrigin);
  for (const [key, value] of cookiePairs(request)) {
    if (key !== name) continue;
    const token = parseSessionTokenValue(value);
    if (token !== null) return token;
  }
  return null;
}

/** True when the Cookie header carries a non-empty value under either session cookie name. */
export function carriesSessionCookie(request: Request): boolean {
  return cookiePairs(request).some(([key, value]) => BOTH_NAMES.includes(key) && value !== "");
}

/** True if the response already sets the session cookie (so a logout clear wins over a slide). */
export function hasSessionCookie(response: Response, appOrigin: string): boolean {
  const prefix = `${sessionCookieName(appOrigin)}=`;
  return response.headers.getSetCookie().some((value) => value.startsWith(prefix));
}

/** Max-Age for a freshly issued session. */
export function idleMaxAgeSeconds(idleDays: number): number {
  return idleDays * SECONDS_PER_DAY;
}

/** Max-Age after a slide: whole seconds from `at` to the session's (capped) expiresAt. */
export function remainingMaxAgeSeconds(expiresAt: Date, at: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - at.getTime()) / 1000));
}
```

Replace the whole of `src/modules/auth/internal/wrappers.ts` with:

```ts
import { loadConfig } from "@/modules/config";
import { checkOrigin } from "@/modules/security";
import { UnauthenticatedError, toErrorResponse } from "@/modules/shared";
import {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  hasSessionCookie,
  readSessionToken,
  remainingMaxAgeSeconds,
} from "./cookies";
import { requestMeta } from "./request";
import { resolveSession } from "./sessions";
import type { AuthContext, RouteHandler, SessionHandler } from "./types";

/**
 * Origin check (config read per call, never at import), then the handler. Every thrown value
 * becomes a toErrorResponse, so no route can throw to Next. Outermost on every non-GET route.
 */
export function withOrigin<P extends object>(handler: RouteHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      checkOrigin(request, loadConfig().APP_ORIGIN);
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Resolves the session cookie (401 UNAUTHENTICATED otherwise) and passes an AuthContext. A 401
 * for a request that carried a session cookie (either name, any non-empty value) also clears the
 * configured cookie; a request without one gets no Set-Cookie. A resolveSession outage goes to
 * the catch (503, no clear: an outage must not sign people out). When the session slid,
 * re-sends the cookie with the new Max-Age unless the handler set it itself.
 */
export function withSession<P extends object>(handler: SessionHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      const { APP_ORIGIN } = loadConfig();
      const meta = requestMeta(request);
      const token = readSessionToken(request, APP_ORIGIN);
      const resolution = await resolveSession(token, meta.at);
      if (token === null || resolution === null) {
        const response = toErrorResponse(new UnauthenticatedError());
        if (carriesSessionCookie(request)) {
          response.headers.append("Set-Cookie", clearSessionCookie(APP_ORIGIN));
        }
        return response;
      }
      const auth: AuthContext = { ...meta, session: resolution.session };
      const response = await handler(request, auth, context);
      if (resolution.slid && !hasSessionCookie(response, APP_ORIGIN)) {
        const maxAge = remainingMaxAgeSeconds(resolution.session.expiresAt, meta.at);
        response.headers.append("Set-Cookie", buildSessionCookie(token, maxAge, APP_ORIGIN));
      }
      return response;
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
```

Replace the whole of `src/modules/auth/index.ts` with:

```ts
export { ensureAuthReady, registerAuthIndexes } from "./internal/indexes";
export type { ChallengeDoc, SessionDoc, UserDoc } from "./internal/collections";
export type {
  AuthContext,
  ChallengeView,
  CurrentSession,
  HandlerContext,
  LinkResult,
  MeView,
  RequestMeta,
  RevokeResult,
  RouteHandler,
  SessionHandler,
  SessionResolution,
  SessionView,
  SignInResult,
  UnlinkResult,
} from "./internal/types";
export {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "./internal/cookies";
export type { SessionCookieName } from "./internal/cookies";
export { requestMeta } from "./internal/request";
export { issueChallenge, verifySignIn } from "./internal/sign-in";
export { createSession, logout, resolveSession } from "./internal/sessions";
export { listSessions, revokeSession } from "./internal/session-management";
export { issueLinkChallenge, unlinkWallet, verifyLink } from "./internal/link";
export { getMe, listWallets } from "./internal/account";
export { withOrigin, withSession } from "./internal/wrappers";
```

- [ ] **Step 5: Run to verify they pass**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/unit/auth/cookies.test.ts tests/integration/routes/v1/stale-cookie.test.ts`
Expected: PASS, `Tests  34 passed`.
What would make it fail: appending the clear unconditionally (the "no Set-Cookie" case), clearing inside the `catch` (the 503 case), or checking only the configured cookie name (the "other cookie name" case).

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  739 passed (739)`. Existing 02a tests that expect `setCookies` to be `[]` on 401 send no cookie, so they still pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth/internal/cookies.ts src/modules/auth/internal/wrappers.ts src/modules/auth/index.ts tests/unit/auth/cookies.test.ts tests/integration/routes/v1/stale-cookie.test.ts
git commit -m "fix(auth): clear a stale session cookie on 401" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 4: Read-only session resolution for server components

Spec §7.4 and §8, architecture §3.5 and §5.4. `resolveSession` gains a third `{ slide }` parameter (default `true`, unchanged behaviour); `slide: false` only reads. `resolvePageSession(cookies)` is what server components call. `getMe`, `listWallets` and `listSessions` accept the narrower `SessionReader`.

**Files:**
- Modify: `src/modules/auth/internal/types.ts`, `src/modules/auth/internal/sessions.ts`, `src/modules/auth/internal/account.ts`, `src/modules/auth/internal/session-management.ts`, `src/modules/auth/index.ts`
- Create: `src/modules/auth/internal/page-session.ts`, `tests/integration/auth/resolve-session-slide.test.ts`, `tests/integration/auth/page-session.test.ts`
- Test: the two new integration files

**Interfaces:**
- Consumes: `parseSessionTokenValue` and `sessionCookieName` (Task 3), `now()` from `@/modules/shared`, `loadConfig().APP_ORIGIN`; helpers `useTestClock(start)`, `startStandalone`, `useDatabaseUri`, `createTestWallet`.
- Produces (exported from `@/modules/auth`):
  - `resolveSession(token: string | null, at: Date, options?: { readonly slide?: boolean }): Promise<SessionResolution | null>`
  - `type SessionReader = Pick<AuthContext, "at" | "session">`; `type PageSession = SessionReader`; `interface CookieReader { get(name: string): { readonly value: string } | undefined }` (structurally satisfied by `await cookies()` from `next/headers`)
  - `resolvePageSession(cookies: CookieReader): Promise<PageSession | null>` — reads the configured cookie, `null` without a database call for a missing or malformed value, otherwise `resolveSession(token, now(), { slide: false })`; throws `DependencyUnavailableError` on an outage
  - `getMe(auth: SessionReader): Promise<MeView>`, `listWallets(auth: SessionReader): Promise<WalletView[]>`, `listSessions(auth: SessionReader): Promise<SessionView[]>` (AuthContext callers unchanged)

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/auth/resolve-session-slide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { issueChallenge, resolveSession, verifySignIn } from "@/modules/auth";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { createTestWallet } from "../../helpers/ed25519";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const HOUR = 3_600_000;

async function signInAt(at: Date): Promise<string> {
  const wallet = createTestWallet();
  const meta = { at, ip: "unknown", userAgent: null };
  const view = await issueChallenge({ address: wallet.address, network: "devnet" }, meta);
  const result = await verifySignIn(
    { challengeId: view.challengeId, signature: wallet.sign(view.message) },
    meta,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(result.setCookie)?.[1];
  if (token === undefined) throw new Error("no token");
  return token;
}

async function storedTimes(token: string): Promise<{ lastSeenAt: Date; expiresAt: Date }> {
  const doc = await (await getDb()).collection("sessions").findOne({ tokenHash: sha256Hex(token) });
  if (doc === null) throw new Error("no session doc");
  return { lastSeenAt: doc.lastSeenAt as Date, expiresAt: doc.expiresAt as Date };
}

describe("resolveSession(token, at, { slide }) (spec §7.4)", () => {
  it("never writes with slide: false, even when a slide is due", async () => {
    const token = await signInAt(T0);
    const before = await storedTimes(token);
    const later = new Date(T0.getTime() + 2 * HOUR);
    const resolution = await resolveSession(token, later, { slide: false });
    expect(resolution).not.toBeNull();
    expect(resolution?.slid).toBe(false);
    expect(resolution?.session.expiresAt).toEqual(before.expiresAt);
    expect(await storedTimes(token)).toEqual(before);
  });

  it("still slides by default at the same time (control)", async () => {
    const token = await signInAt(T0);
    const before = await storedTimes(token);
    const later = new Date(T0.getTime() + 2 * HOUR);
    const resolution = await resolveSession(token, later);
    expect(resolution?.slid).toBe(true);
    const after = await storedTimes(token);
    expect(after.lastSeenAt).toEqual(later);
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
  });

  it("returns null for an unknown token with slide: false", async () => {
    expect(await resolveSession("c".repeat(43), T0, { slide: false })).toBeNull();
  });
});
```

Create `tests/integration/auth/page-session.test.ts`:

```ts
import { afterEach, describe, expect, inject, it } from "vitest";
import { issueChallenge, resolvePageSession, verifySignIn } from "@/modules/auth";
import { getDb } from "@/modules/database";
import { sha256Hex } from "@/modules/security";
import { DependencyUnavailableError } from "@/modules/shared";
import { useTestClock } from "../../helpers/clock";
import { createTestWallet } from "../../helpers/ed25519";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const HOUR = 3_600_000;
/** The integration setup uses https://ghostwire.test, so the configured name is the __Host- one. */
const NAME = "__Host-gw_session";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

async function signInAt(at: Date): Promise<{ token: string; userId: string; walletId: string }> {
  const wallet = createTestWallet();
  const meta = { at, ip: "unknown", userAgent: null };
  const view = await issueChallenge({ address: wallet.address, network: "devnet" }, meta);
  const result = await verifySignIn(
    { challengeId: view.challengeId, signature: wallet.sign(view.message) },
    meta,
  );
  const token = /=([A-Za-z0-9_-]{43});/.exec(result.setCookie)?.[1];
  if (token === undefined) throw new Error("no token");
  return { token, userId: result.body.user.id, walletId: result.body.wallet.id };
}

function jar(entries: Readonly<Record<string, string>>) {
  return { get: (name: string) => (name in entries ? { value: entries[name] ?? "" } : undefined) };
}

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

describe("resolvePageSession", () => {
  it("resolves the configured cookie to a PageSession at now()", async () => {
    const { token, userId, walletId } = await signInAt(T0);
    const clock = useTestClock(new Date(T0.getTime() + 10 * 60_000));
    const page = await resolvePageSession(jar({ [NAME]: token }));
    expect(page?.at).toEqual(clock.now());
    expect(page?.session.userId.toHexString()).toBe(userId);
    expect(page?.session.walletId.toHexString()).toBe(walletId);
    expect(page?.session.network).toBe("devnet");
  });

  it("never writes, even two hours later", async () => {
    const { token } = await signInAt(T0);
    const sessions = (await getDb()).collection("sessions");
    const before = await sessions.findOne({ tokenHash: sha256Hex(token) });
    useTestClock(new Date(T0.getTime() + 2 * HOUR));
    expect(await resolvePageSession(jar({ [NAME]: token }))).not.toBeNull();
    const after = await sessions.findOne({ tokenHash: sha256Hex(token) });
    expect(after?.lastSeenAt).toEqual(before?.lastSeenAt);
    expect(after?.expiresAt).toEqual(before?.expiresAt);
  });

  it("returns null for the other cookie name", async () => {
    const { token } = await signInAt(T0);
    useTestClock(T0);
    expect(await resolvePageSession(jar({ gw_session: token }))).toBeNull();
  });

  it("returns null for a malformed value without querying (works with the database down)", async () => {
    await useDatabaseUri(await stoppedUri());
    expect(await resolvePageSession(jar({ [NAME]: "malformed" }))).toBeNull();
    expect(await resolvePageSession(jar({}))).toBeNull();
  });

  it("throws DependencyUnavailableError for a well-formed token when the database is down", async () => {
    await useDatabaseUri(await stoppedUri());
    await expect(resolvePageSession(jar({ [NAME]: "d".repeat(43) }))).rejects.toBeInstanceOf(
      DependencyUnavailableError,
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/integration/auth/resolve-session-slide.test.ts tests/integration/auth/page-session.test.ts`
Expected: FAIL. `page-session.test.ts` cannot import `resolvePageSession`; in the slide test, "never writes with slide: false" fails (`slid` is `true` and `lastSeenAt` moved).

- [ ] **Step 3: Implement**

Replace the whole of `src/modules/auth/internal/types.ts` with:

```ts
import type { ObjectId } from "@/modules/database";
import type { SolanaNetwork, WalletView } from "@/modules/wallet";

/** Named HandlerContext, not RouteContext, to avoid Next's global RouteContext<'/route'>. */
export interface HandlerContext<P extends object = object> {
  readonly params: Promise<P>;
}

/** The shape Next 16 route handlers satisfy: (request, { params: Promise<P> }) => Promise<Response>. */
export type RouteHandler<P extends object = object> = (
  request: Request,
  context: HandlerContext<P>,
) => Promise<Response>;

export interface RequestMeta {
  /** now() once per request. */
  readonly at: Date;
  /** clientIp(request, TRUST_PROXY). Never persisted or logged. */
  readonly ip: string;
  /** Control characters stripped, at most 128 characters, "" -> null. */
  readonly userAgent: string | null;
}

export interface CurrentSession {
  readonly id: ObjectId;
  readonly userId: ObjectId;
  readonly walletId: ObjectId;
  readonly network: SolanaNetwork;
  readonly createdAt: Date;
  /** After sliding. */
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export interface AuthContext extends RequestMeta {
  readonly session: CurrentSession;
}

/** What read-only views need: the request time and the resolved session. AuthContext satisfies it. */
export type SessionReader = Pick<AuthContext, "at" | "session">;

/** A session resolved for a server component render (never slid). */
export type PageSession = SessionReader;

/** Structural subset of next/headers' ReadonlyRequestCookies, so auth never imports next/headers. */
export interface CookieReader {
  get(name: string): { readonly value: string } | undefined;
}

export type SessionHandler<P extends object = object> = (
  request: Request,
  auth: AuthContext,
  context: HandlerContext<P>,
) => Promise<Response>;

export interface ChallengeView {
  readonly challengeId: string;
  readonly message: string;
  readonly expiresAt: string;
}

export interface SignInResult {
  readonly body: {
    user: { id: string };
    wallet: { id: string; address: string; network: SolanaNetwork };
  };
  readonly setCookie: string;
}

export interface LinkResult {
  readonly wallet: WalletView;
  readonly created: boolean;
}

export interface SessionView {
  readonly id: string;
  readonly current: boolean;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly network: SolanaNetwork;
  readonly userAgent: string | null;
}

export interface MeView {
  readonly user: { id: string; createdAt: string };
  readonly session: { id: string; network: SolanaNetwork; expiresAt: string };
  readonly wallets: WalletView[];
}

export interface SessionResolution {
  readonly session: CurrentSession;
  readonly slid: boolean;
}

export interface UnlinkResult {
  readonly revokedCurrent: boolean;
}

export interface RevokeResult {
  readonly revokedCurrent: boolean;
}
```

Replace the whole of `src/modules/auth/internal/sessions.ts` with:

```ts
import { loadConfig } from "@/modules/config";
import { safeEquals, type ClientSession, type ObjectId } from "@/modules/database";
import { recordSecurityEvent, sha256Hex } from "@/modules/security";
import type { SolanaNetwork } from "@/modules/wallet";
import { sessions, users, type SessionDoc } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { AuthContext, SessionResolution } from "./types";

const DAY_MS = 86_400_000;
/** lastSeenAt and expiresAt are written at most once per hour per session. */
const SLIDE_INTERVAL_MS = 3_600_000;

/** Inside the sign-in transaction only. Lifetimes come from SESSION_IDLE_DAYS / SESSION_MAX_DAYS. */
export function createSession(
  input: {
    readonly tokenHash: string;
    readonly userId: ObjectId;
    readonly walletId: ObjectId;
    readonly network: SolanaNetwork;
    readonly userAgent: string | null;
    readonly at: Date;
  },
  options: { session: ClientSession },
): Promise<SessionDoc> {
  const { SESSION_IDLE_DAYS, SESSION_MAX_DAYS } = loadConfig();
  const atMs = input.at.getTime();
  return sessions.insertOne(
    {
      tokenHash: input.tokenHash,
      userId: input.userId,
      walletId: input.walletId,
      network: input.network,
      createdAt: input.at,
      lastSeenAt: input.at,
      expiresAt: new Date(atMs + SESSION_IDLE_DAYS * DAY_MS),
      absoluteExpiresAt: new Date(atMs + SESSION_MAX_DAYS * DAY_MS),
      revokedAt: null,
      userAgent: input.userAgent,
    },
    { session: options.session },
  );
}

/**
 * null for: no token, unknown hash, revoked, expired (idle or absolute), user missing or not
 * active. On success, unless options.slide is false, slides expiresAt to
 * min(at + idle, absoluteExpiresAt), at most once per hour, with a compare-and-set on lastSeenAt
 * so concurrent requests write once. With slide: false it only reads (server components).
 */
export async function resolveSession(
  token: string | null,
  at: Date,
  options: { readonly slide?: boolean } = {},
): Promise<SessionResolution | null> {
  const slide = options.slide ?? true;
  if (token === null) return null;
  await ensureAuthReady();
  const doc = await sessions.findOne(safeEquals("tokenHash", sha256Hex(token)));
  const atMs = at.getTime();
  if (
    doc === null ||
    doc.revokedAt !== null ||
    doc.expiresAt.getTime() <= atMs ||
    doc.absoluteExpiresAt.getTime() <= atMs
  ) {
    return null;
  }
  const user = await users.findOne(safeEquals("_id", doc.userId));
  if (user === null || user.status !== "active") return null;

  let expiresAt = doc.expiresAt;
  let slid = false;
  if (slide && atMs - doc.lastSeenAt.getTime() >= SLIDE_INTERVAL_MS) {
    const { SESSION_IDLE_DAYS } = loadConfig();
    const next = new Date(
      Math.min(atMs + SESSION_IDLE_DAYS * DAY_MS, doc.absoluteExpiresAt.getTime()),
    );
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", doc._id), safeEquals("lastSeenAt", doc.lastSeenAt), {
        revokedAt: null,
      }),
      { $set: { lastSeenAt: at, expiresAt: next } },
    );
    if (result.modifiedCount === 1) {
      slid = true;
      expiresAt = next;
    }
  }
  return {
    session: {
      id: doc._id,
      userId: doc.userId,
      walletId: doc.walletId,
      network: doc.network,
      createdAt: doc.createdAt,
      expiresAt,
      absoluteExpiresAt: doc.absoluteExpiresAt,
    },
    slid,
  };
}

/** Revokes the current session. A session_revoked event is recorded only if it was active. */
export async function logout(auth: AuthContext): Promise<void> {
  await ensureAuthReady();
  const result = await sessions.updateOne(
    Object.assign(
      {},
      safeEquals("_id", auth.session.id),
      safeEquals("userId", auth.session.userId),
      { revokedAt: null },
    ),
    { $set: { revokedAt: auth.at } },
  );
  if (result.modifiedCount === 1) {
    await recordSecurityEvent({
      type: "session_revoked",
      severity: "info",
      userId: auth.session.userId,
      walletId: auth.session.walletId,
      reason: "logout",
      at: auth.at,
    });
  }
}
```

Replace the whole of `src/modules/auth/internal/account.ts` with:

```ts
import { safeEquals } from "@/modules/database";
import { UnauthenticatedError } from "@/modules/shared";
import { listWalletsByUser, toWalletView, type WalletView } from "@/modules/wallet";
import { users } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { MeView, SessionReader } from "./types";

/** GET /me. Lists every wallet of the user, disconnected ones included, with their status. */
export async function getMe(auth: SessionReader): Promise<MeView> {
  await ensureAuthReady();
  const user = await users.findOne(safeEquals("_id", auth.session.userId));
  if (user === null) throw new UnauthenticatedError();
  const wallets = await listWalletsByUser(auth.session.userId);
  return {
    user: { id: user._id.toHexString(), createdAt: user.createdAt.toISOString() },
    session: {
      id: auth.session.id.toHexString(),
      network: auth.session.network,
      expiresAt: auth.session.expiresAt.toISOString(),
    },
    wallets: wallets.map((wallet) => toWalletView(wallet)),
  };
}

/** GET /wallets. Same view as /me, disconnected wallets included. */
export async function listWallets(auth: SessionReader): Promise<WalletView[]> {
  await ensureAuthReady();
  const wallets = await listWalletsByUser(auth.session.userId);
  return wallets.map((wallet) => toWalletView(wallet));
}
```

Replace the whole of `src/modules/auth/internal/session-management.ts` with:

```ts
import { parseObjectId, safeEquals } from "@/modules/database";
import { recordSecurityEvent } from "@/modules/security";
import { NotFoundError } from "@/modules/shared";
import { sessions } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { AuthContext, RevokeResult, SessionReader, SessionView } from "./types";

const MAX_SESSIONS_LISTED = 100;

/** Active sessions of the caller (not revoked, not expired), lastSeenAt descending, limit 100. */
export async function listSessions(auth: SessionReader): Promise<SessionView[]> {
  await ensureAuthReady();
  const docs = await sessions.find(
    Object.assign({}, safeEquals("userId", auth.session.userId), {
      revokedAt: null,
      expiresAt: { $gt: auth.at },
      absoluteExpiresAt: { $gt: auth.at },
    }),
    { limit: MAX_SESSIONS_LISTED, sort: { lastSeenAt: -1, _id: -1 } },
  );
  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    current: doc._id.equals(auth.session.id),
    createdAt: doc.createdAt.toISOString(),
    lastSeenAt: doc.lastSeenAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    network: doc.network,
    userAgent: doc.userAgent,
  }));
}

/**
 * DELETE /sessions/:id. Only the caller's own sessions. Revoking an already-revoked own session
 * is a 204 no-op. A session_revoked event (reason user_revoked) is recorded only when the session
 * was active before.
 * @throws NotFoundError when the id is malformed, nonexistent or owned by another user
 */
export async function revokeSession(sessionId: string, auth: AuthContext): Promise<RevokeResult> {
  const id = parseObjectId(sessionId);
  if (id === null) throw new NotFoundError();
  await ensureAuthReady();
  const owned = Object.assign({}, safeEquals("_id", id), safeEquals("userId", auth.session.userId));
  const before = await sessions.findOne(owned);
  if (before === null) throw new NotFoundError();
  const result = await sessions.updateOne(Object.assign({}, owned, { revokedAt: null }), {
    $set: { revokedAt: auth.at },
  });
  if (result.matchedCount === 1) {
    await recordSecurityEvent({
      type: "session_revoked",
      severity: "info",
      userId: auth.session.userId,
      walletId: before.walletId,
      reason: "user_revoked",
      at: auth.at,
    });
  }
  return { revokedCurrent: id.equals(auth.session.id) };
}
```

Create `src/modules/auth/internal/page-session.ts`:

```ts
import { loadConfig } from "@/modules/config";
import { now } from "@/modules/shared";
import { parseSessionTokenValue, sessionCookieName } from "./cookies";
import { resolveSession } from "./sessions";
import type { CookieReader, PageSession } from "./types";

/**
 * For server components: reads the configured cookie name, then
 * resolveSession(token, now(), { slide: false }). Never writes. A missing or malformed value
 * returns null without touching the database.
 * @throws DependencyUnavailableError when the database is unreachable
 */
export async function resolvePageSession(cookies: CookieReader): Promise<PageSession | null> {
  const name = sessionCookieName(loadConfig().APP_ORIGIN);
  const token = parseSessionTokenValue(cookies.get(name)?.value);
  if (token === null) return null;
  const at = now();
  const resolution = await resolveSession(token, at, { slide: false });
  return resolution === null ? null : { at, session: resolution.session };
}
```

Replace the whole of `src/modules/auth/index.ts` with:

```ts
export { ensureAuthReady, registerAuthIndexes } from "./internal/indexes";
export type { ChallengeDoc, SessionDoc, UserDoc } from "./internal/collections";
export type {
  AuthContext,
  ChallengeView,
  CookieReader,
  CurrentSession,
  HandlerContext,
  LinkResult,
  MeView,
  PageSession,
  RequestMeta,
  RevokeResult,
  RouteHandler,
  SessionHandler,
  SessionReader,
  SessionResolution,
  SessionView,
  SignInResult,
  UnlinkResult,
} from "./internal/types";
export {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "./internal/cookies";
export type { SessionCookieName } from "./internal/cookies";
export { requestMeta } from "./internal/request";
export { issueChallenge, verifySignIn } from "./internal/sign-in";
export { createSession, logout, resolveSession } from "./internal/sessions";
export { listSessions, revokeSession } from "./internal/session-management";
export { issueLinkChallenge, unlinkWallet, verifyLink } from "./internal/link";
export { getMe, listWallets } from "./internal/account";
export { withOrigin, withSession } from "./internal/wrappers";
export { resolvePageSession } from "./internal/page-session";
```

- [ ] **Step 4: Run to verify they pass**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/integration/auth/resolve-session-slide.test.ts tests/integration/auth/page-session.test.ts`
Expected: PASS, `Tests  8 passed`.
What would make it fail: ignoring `options.slide` (the "never writes" cases compare `lastSeenAt`/`expiresAt` in the database before and after), or calling `resolveSession` for a malformed value (the database-down case would throw instead of returning `null`).

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  747 passed (747)`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/auth/internal/types.ts src/modules/auth/internal/sessions.ts src/modules/auth/internal/account.ts src/modules/auth/internal/session-management.ts src/modules/auth/internal/page-session.ts src/modules/auth/index.ts tests/integration/auth/resolve-session-slide.test.ts tests/integration/auth/page-session.test.ts
git commit -m "feat(auth): add read-only resolvePageSession and resolveSession slide option" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 5: Replace the previous session on re-sign-in

Spec §7.3, architecture §5.3. After a successful sign-in commits, the request's previous session (any user) is revoked best-effort with the new static reason `replaced`. Link verify revokes nothing.

**Files:**
- Modify: `src/modules/security/internal/events.ts`, `src/modules/auth/internal/sessions.ts`, `src/modules/auth/internal/sign-in.ts`, `src/modules/auth/index.ts`, `src/app/api/v1/auth/verify/route.ts`
- Create: `tests/integration/routes/v1/session-replace.test.ts`
- Test: `tests/integration/routes/v1/session-replace.test.ts`

**Interfaces:**
- Consumes: `resolveSession(token, at, { slide: false })` (Task 4), `readSessionToken`, `recordSecurityEvent`, `safeEquals`, `isAppError`, `logger`; helpers `signIn`, `linkWallet`, `useTestClock`, `captureLogLines`, `TestClient`.
- Produces: `SECURITY_REASONS` ends with `"replaced"`; `replaceSession(token: string | null, at: Date): Promise<void>` (exported from `@/modules/auth`, never rejects; on failure logs `warn "previous session revoke failed" { code }` with no `err`); `verifySignIn(body: unknown, meta: RequestMeta, options?: { readonly previousToken?: string | null }): Promise<SignInResult>`. The verify route passes `readSessionToken(request, loadConfig().APP_ORIGIN)` as `previousToken`. A same-address sign-in on the other network is a different account (wallets are unique per `(address, network)`), so a network switch revokes a *different user's* session; that is intended.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/routes/v1/session-replace.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/api/v1/auth/logout/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as sessionsRoute from "@/app/api/v1/sessions/route";
import { getDb } from "@/modules/database";
import { linkWallet, signIn } from "../../../helpers/auth";
import { useTestClock } from "../../../helpers/clock";
import { createTestWallet } from "../../../helpers/ed25519";
import { TestClient } from "../../../helpers/http";
import { captureLogLines, type CapturedLogs } from "../../../helpers/logs";

const T0 = new Date("2026-11-13T10:00:00.000Z");
const DAY = 86_400_000;

let capture: CapturedLogs | null = null;

beforeEach(async () => {
  const db = await getDb();
  for (const name of ["users", "wallets", "auth_challenges", "sessions", "security_events"]) {
    await db.collection(name).deleteMany({});
  }
});

afterEach(async () => {
  capture?.restore();
  capture = null;
  await (await getDb()).command({ collMod: "sessions", validator: {}, validationLevel: "off" });
});

/** /me with an explicit token (null jar = no cookie). */
async function meStatus(token: string | null): Promise<number> {
  const client = new TestClient();
  client.setCookie(token);
  return (await client.call(meRoute.GET, { method: "GET", path: "/api/v1/me" })).status;
}

async function replacedEvents(): Promise<{ userId: string }[]> {
  const docs = await (
    await getDb()
  )
    .collection("security_events")
    .find({ type: "session_revoked", reason: "replaced" })
    .toArray();
  return docs.map((doc) => ({ userId: String(doc.userId) }));
}

describe("re-sign-in replaces the request's previous session (spec §7.3)", () => {
  it("revokes the same user's previous session and keeps exactly one active", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const first = await signIn(client, wallet);
    const oldToken = client.cookie;
    await signIn(client, wallet);
    const newToken = client.cookie;
    expect(newToken).not.toBe(oldToken);
    expect(await meStatus(oldToken)).toBe(401);
    expect(await meStatus(newToken)).toBe(200);
    const sessions = await client.call(sessionsRoute.GET, {
      method: "GET",
      path: "/api/v1/sessions",
    });
    expect((sessions.json as { sessions: unknown[] }).sessions).toHaveLength(1);
    const events = await replacedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(first.userId);
  });

  it("revokes a different user's session held by the same client (network switch)", async () => {
    const client = new TestClient();
    const wallet = createTestWallet();
    const devnet = await signIn(client, wallet, "devnet");
    const oldToken = client.cookie;
    const mainnet = await signIn(client, wallet, "mainnet-beta");
    expect(mainnet.userId).not.toBe(devnet.userId);
    expect(await meStatus(oldToken)).toBe(401);
    expect(await meStatus(client.cookie)).toBe(200);
    const events = await replacedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(devnet.userId);
  });

  it("records nothing when the previous token is already revoked", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const oldToken = client.cookie;
    await client.call(logoutRoute.POST, { method: "POST", path: "/api/v1/auth/logout" });
    client.setCookie(oldToken);
    await signIn(client, createTestWallet());
    expect(await meStatus(client.cookie)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("records nothing when the previous session has expired", async () => {
    const clock = useTestClock(T0);
    const client = new TestClient();
    await signIn(client, createTestWallet());
    clock.advance(8 * DAY);
    await signIn(client, createTestWallet());
    expect(await meStatus(client.cookie)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("does not revoke anything on link verify", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const token = client.cookie;
    expect((await linkWallet(client, createTestWallet())).status).toBe(201);
    expect(client.cookie).toBe(token);
    expect(await meStatus(token)).toBe(200);
    expect(await replacedEvents()).toEqual([]);
  });

  it("is best effort: a failed revoke still returns 200 with a new cookie and logs warn with a code only", async () => {
    const client = new TestClient();
    await signIn(client, createTestWallet());
    const oldToken = client.cookie;
    // From now on any update that sets revokedAt to a date is rejected by the server.
    await (
      await getDb()
    ).command({
      collMod: "sessions",
      validator: { $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }] },
      validationLevel: "strict",
      validationAction: "error",
    });
    capture = captureLogLines();
    await signIn(client, createTestWallet());
    const newToken = client.cookie;
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);
    expect(await meStatus(newToken)).toBe(200);
    expect(await meStatus(oldToken)).toBe(200);
    const warn = capture
      .lines()
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.msg === "previous session revoke failed");
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ level: "warn" });
    expect(typeof warn[0]?.code).toBe("string");
    expect(warn[0]).not.toHaveProperty("err");
    expect(await replacedEvents()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/integration/routes/v1/session-replace.test.ts`
Expected: FAIL. The same-user, network-switch and best-effort cases fail (the old token still answers 200; no `replaced` event; no warn line). The three "records nothing / revokes nothing" cases pass already.

- [ ] **Step 3: Implement**

Replace the whole of `src/modules/security/internal/events.ts` with:

```ts
import { z } from "zod";
import { objectIdSchema, typedCollection, type ObjectId } from "@/modules/database";
import { logger } from "@/modules/shared";

export const SECURITY_EVENT_TYPES = [
  "signin_success",
  "signin_failed",
  "wallet_linked",
  "link_failed",
  "wallet_unlinked",
  "session_revoked",
  "rate_limited",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_SEVERITIES = ["info", "warning", "critical"] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

/** Static reasons only. Never a value derived from the request. */
export const SECURITY_REASONS = [
  "challenge_unavailable",
  "message_integrity",
  "network_unsupported",
  "signature_invalid",
  "user_inactive",
  "wallet_other_account",
  "rate_limit_exceeded",
  "logout",
  "user_revoked",
  "wallet_unlinked",
  "replaced",
] as const;
export type SecurityReason = (typeof SECURITY_REASONS)[number];

export interface SecurityEventInput {
  readonly type: SecurityEventType;
  readonly severity: SecuritySeverity;
  readonly userId: ObjectId | null;
  readonly walletId: ObjectId | null;
  readonly reason: SecurityReason | null;
  readonly at: Date;
}

export const SECURITY_EVENTS_COLLECTION = "security_events";

const securityEventSchema = z.strictObject({
  type: z.enum(SECURITY_EVENT_TYPES),
  severity: z.enum(SECURITY_SEVERITIES),
  userId: objectIdSchema.nullable(),
  walletId: objectIdSchema.nullable(),
  reason: z.enum(SECURITY_REASONS).nullable(),
  createdAt: z.date(),
});

const events = typedCollection(SECURITY_EVENTS_COLLECTION, securityEventSchema);

/** The matching static reason, or null when value is not one. */
export function toSecurityReason(value: string): SecurityReason | null {
  return SECURITY_REASONS.find((reason) => reason === value) ?? null;
}

/**
 * Best effort and awaited: never rejects. A failed insert is logged at warn. Never call it inside
 * a withTransaction fn (it would roll back and could run more than once).
 */
export async function recordSecurityEvent(event: SecurityEventInput): Promise<void> {
  try {
    await events.insertOne({
      type: event.type,
      severity: event.severity,
      userId: event.userId,
      walletId: event.walletId,
      reason: event.reason,
      createdAt: event.at,
    });
  } catch (error) {
    logger.warn("security event write failed", { type: event.type, err: error });
  }
}
```

Replace the whole of `src/modules/auth/internal/sessions.ts` with:

```ts
import { loadConfig } from "@/modules/config";
import { safeEquals, type ClientSession, type ObjectId } from "@/modules/database";
import { recordSecurityEvent, sha256Hex } from "@/modules/security";
import { isAppError, logger } from "@/modules/shared";
import type { SolanaNetwork } from "@/modules/wallet";
import { sessions, users, type SessionDoc } from "./collections";
import { ensureAuthReady } from "./indexes";
import type { AuthContext, SessionResolution } from "./types";

const DAY_MS = 86_400_000;
/** lastSeenAt and expiresAt are written at most once per hour per session. */
const SLIDE_INTERVAL_MS = 3_600_000;

/** Inside the sign-in transaction only. Lifetimes come from SESSION_IDLE_DAYS / SESSION_MAX_DAYS. */
export function createSession(
  input: {
    readonly tokenHash: string;
    readonly userId: ObjectId;
    readonly walletId: ObjectId;
    readonly network: SolanaNetwork;
    readonly userAgent: string | null;
    readonly at: Date;
  },
  options: { session: ClientSession },
): Promise<SessionDoc> {
  const { SESSION_IDLE_DAYS, SESSION_MAX_DAYS } = loadConfig();
  const atMs = input.at.getTime();
  return sessions.insertOne(
    {
      tokenHash: input.tokenHash,
      userId: input.userId,
      walletId: input.walletId,
      network: input.network,
      createdAt: input.at,
      lastSeenAt: input.at,
      expiresAt: new Date(atMs + SESSION_IDLE_DAYS * DAY_MS),
      absoluteExpiresAt: new Date(atMs + SESSION_MAX_DAYS * DAY_MS),
      revokedAt: null,
      userAgent: input.userAgent,
    },
    { session: options.session },
  );
}

/**
 * null for: no token, unknown hash, revoked, expired (idle or absolute), user missing or not
 * active. On success, unless options.slide is false, slides expiresAt to
 * min(at + idle, absoluteExpiresAt), at most once per hour, with a compare-and-set on lastSeenAt
 * so concurrent requests write once. With slide: false it only reads (server components).
 */
export async function resolveSession(
  token: string | null,
  at: Date,
  options: { readonly slide?: boolean } = {},
): Promise<SessionResolution | null> {
  const slide = options.slide ?? true;
  if (token === null) return null;
  await ensureAuthReady();
  const doc = await sessions.findOne(safeEquals("tokenHash", sha256Hex(token)));
  const atMs = at.getTime();
  if (
    doc === null ||
    doc.revokedAt !== null ||
    doc.expiresAt.getTime() <= atMs ||
    doc.absoluteExpiresAt.getTime() <= atMs
  ) {
    return null;
  }
  const user = await users.findOne(safeEquals("_id", doc.userId));
  if (user === null || user.status !== "active") return null;

  let expiresAt = doc.expiresAt;
  let slid = false;
  if (slide && atMs - doc.lastSeenAt.getTime() >= SLIDE_INTERVAL_MS) {
    const { SESSION_IDLE_DAYS } = loadConfig();
    const next = new Date(
      Math.min(atMs + SESSION_IDLE_DAYS * DAY_MS, doc.absoluteExpiresAt.getTime()),
    );
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", doc._id), safeEquals("lastSeenAt", doc.lastSeenAt), {
        revokedAt: null,
      }),
      { $set: { lastSeenAt: at, expiresAt: next } },
    );
    if (result.modifiedCount === 1) {
      slid = true;
      expiresAt = next;
    }
  }
  return {
    session: {
      id: doc._id,
      userId: doc.userId,
      walletId: doc.walletId,
      network: doc.network,
      createdAt: doc.createdAt,
      expiresAt,
      absoluteExpiresAt: doc.absoluteExpiresAt,
    },
    slid,
  };
}

/** Revokes the current session. A session_revoked event is recorded only if it was active. */
export async function logout(auth: AuthContext): Promise<void> {
  await ensureAuthReady();
  const result = await sessions.updateOne(
    Object.assign(
      {},
      safeEquals("_id", auth.session.id),
      safeEquals("userId", auth.session.userId),
      { revokedAt: null },
    ),
    { $set: { revokedAt: auth.at } },
  );
  if (result.modifiedCount === 1) {
    await recordSecurityEvent({
      type: "session_revoked",
      severity: "info",
      userId: auth.session.userId,
      walletId: auth.session.walletId,
      reason: "logout",
      at: auth.at,
    });
  }
}

/**
 * Best effort, never rejects: revokes the still-active session behind `token` (any user) with
 * reason "replaced". Used by sign-in after the new session has committed. The atomic
 * revokedAt: null filter is the same mechanism logout uses. A failure logs a code only (never
 * err, so a driver error cannot leak a filter's token hash).
 */
export async function replaceSession(token: string | null, at: Date): Promise<void> {
  if (token === null) return;
  try {
    const previous = await resolveSession(token, at, { slide: false });
    if (previous === null) return;
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", previous.session.id), { revokedAt: null }),
      { $set: { revokedAt: at } },
    );
    if (result.modifiedCount === 1) {
      await recordSecurityEvent({
        type: "session_revoked",
        severity: "info",
        userId: previous.session.userId,
        walletId: previous.session.walletId,
        reason: "replaced",
        at,
      });
    }
  } catch (error) {
    logger.warn("previous session revoke failed", {
      code: isAppError(error) ? error.code : "UNKNOWN",
    });
  }
}
```

Replace the whole of `src/modules/auth/internal/sign-in.ts` with:

```ts
import { loadConfig } from "@/modules/config";
import { safeEquals, withTransaction, type ObjectId } from "@/modules/database";
import {
  randomToken,
  rateLimit,
  recordSecurityEvent,
  sha256Hex,
  toSecurityReason,
} from "@/modules/security";
import { AuthFailedError, ConflictError, InternalError, logger } from "@/modules/shared";
import {
  findWalletByAddress,
  insertWallet,
  setWalletStatus,
  touchWallet,
  type SolanaAddress,
  type SolanaNetwork,
  type WalletDoc,
} from "@/modules/wallet";
import { checkChallenge, consumeChallenge, insertChallenge } from "./challenges";
import { users } from "./collections";
import { buildSessionCookie, idleMaxAgeSeconds } from "./cookies";
import { authFailed } from "./errors";
import { strictlyAfter } from "./guard";
import { ensureAuthReady } from "./indexes";
import { parseChallengeBody, parseVerifyBody } from "./request";
import { createSession, replaceSession } from "./sessions";
import type { ChallengeView, RequestMeta, SignInResult } from "./types";

const SESSION_TOKEN_BYTES = 32;
const MINUTE = 60;
const HOUR = 3600;

function isDuplicateKey(error: unknown): boolean {
  return error instanceof ConflictError && error.code === "DUPLICATE_KEY";
}

/**
 * POST /auth/challenge. The IP limit runs before the body is parsed, so malformed floods count.
 * @throws ValidationError (VALIDATION_FAILED | NETWORK_UNSUPPORTED), RateLimitedError, DependencyUnavailableError
 */
export async function issueChallenge(body: unknown, meta: RequestMeta): Promise<ChallengeView> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(
    `signin_challenge:ip:${meta.ip}`,
    config.RATE_LIMIT_CHALLENGE_PER_MIN,
    MINUTE,
    meta.at,
  );
  const { address, network } = parseChallengeBody(body, config.SOLANA_NETWORKS);
  await rateLimit(
    `signin_challenge:address:${address}`,
    config.RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS,
    HOUR,
    meta.at,
  );
  return insertChallenge({ purpose: "signin", address, network, userId: null, at: meta.at });
}

interface SignInWrite {
  readonly address: SolanaAddress;
  readonly network: SolanaNetwork;
  readonly provider: string | null;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly at: Date;
}

/**
 * The sign-in transaction (safe to re-run: database writes only, all with `session`). Always
 * writes the wallet doc, even when it is already active, so a concurrent unlink conflicts.
 * An outer loop of at most 2 runs retries only a DUPLICATE_KEY from a racing first sign-in.
 */
async function writeSignIn(input: SignInWrite): Promise<{ userId: ObjectId; wallet: WalletDoc }> {
  for (let run = 1; ; run += 1) {
    try {
      return await withTransaction(async (session) => {
        const existing = await findWalletByAddress(input.address, input.network, { session });
        let userId: ObjectId;
        let wallet: WalletDoc | null;
        if (existing === null) {
          const user = await users.insertOne(
            { status: "active", createdAt: input.at, updatedAt: input.at },
            { session },
          );
          userId = user._id;
          wallet = await insertWallet(
            {
              userId,
              address: input.address,
              network: input.network,
              provider: input.provider,
              at: input.at,
            },
            { session },
          );
        } else {
          const user = await users.findOne(safeEquals("_id", existing.userId), { session });
          if (user === null || user.status !== "active") throw authFailed("user_inactive");
          userId = user._id;
          wallet =
            existing.status === "disconnected"
              ? await setWalletStatus(existing._id, "active", input.at, {
                  session,
                  provider: input.provider,
                })
              : await touchWallet(existing._id, strictlyAfter(input.at, existing.updatedAt), {
                  session,
                });
          if (wallet === null) {
            throw new InternalError({
              code: "DATA_INTEGRITY",
              message: "wallets: wallet disappeared inside the sign-in transaction",
            });
          }
        }
        await createSession(
          {
            tokenHash: input.tokenHash,
            userId,
            walletId: wallet._id,
            network: input.network,
            userAgent: input.userAgent,
            at: input.at,
          },
          { session },
        );
        return { userId, wallet };
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (run >= 2) {
        throw new InternalError({
          code: "SIGNIN_CONFLICT",
          message: "sign-in hit a duplicate key twice",
          cause: error,
        });
      }
    }
  }
}

/**
 * POST /auth/verify. Consumption happens outside the transaction, so a bad signature still
 * burns the challenge. Every AuthFailedError records signin_failed with its static reason.
 * After the new session commits, the request's previous session (options.previousToken, any
 * user) is revoked best-effort with reason "replaced"; a failure there never fails sign-in.
 * @throws ValidationError, AuthFailedError, RateLimitedError, DependencyUnavailableError
 */
export async function verifySignIn(
  body: unknown,
  meta: RequestMeta,
  options: { readonly previousToken?: string | null } = {},
): Promise<SignInResult> {
  await ensureAuthReady();
  const config = loadConfig();
  await rateLimit(`signin_verify:ip:${meta.ip}`, config.RATE_LIMIT_VERIFY_PER_MIN, MINUTE, meta.at);
  const request = parseVerifyBody(body);
  try {
    const challenge = await consumeChallenge({
      challengeId: request.challengeId,
      purpose: "signin",
      userId: null,
      at: meta.at,
    });
    const address = checkChallenge(challenge, request.signature, config.SOLANA_NETWORKS);
    const token = randomToken(SESSION_TOKEN_BYTES);
    const { userId, wallet } = await writeSignIn({
      address,
      network: challenge.network,
      provider: request.provider,
      tokenHash: sha256Hex(token),
      userAgent: meta.userAgent,
      at: meta.at,
    });
    await recordSecurityEvent({
      type: "signin_success",
      severity: "info",
      userId,
      walletId: wallet._id,
      reason: null,
      at: meta.at,
    });
    await replaceSession(options.previousToken ?? null, meta.at);
    return {
      body: {
        user: { id: userId.toHexString() },
        wallet: { id: wallet._id.toHexString(), address: wallet.address, network: wallet.network },
      },
      setCookie: buildSessionCookie(
        token,
        idleMaxAgeSeconds(config.SESSION_IDLE_DAYS),
        config.APP_ORIGIN,
      ),
    };
  } catch (error) {
    if (error instanceof AuthFailedError) {
      logger.info("auth failed", { reason: error.reason, cid: request.challengeId.toHexString() });
      await recordSecurityEvent({
        type: "signin_failed",
        severity: "warning",
        userId: null,
        walletId: null,
        reason: toSecurityReason(error.reason),
        at: meta.at,
      });
    }
    throw error;
  }
}
```

Replace the whole of `src/modules/auth/index.ts` with:

```ts
export { ensureAuthReady, registerAuthIndexes } from "./internal/indexes";
export type { ChallengeDoc, SessionDoc, UserDoc } from "./internal/collections";
export type {
  AuthContext,
  ChallengeView,
  CookieReader,
  CurrentSession,
  HandlerContext,
  LinkResult,
  MeView,
  PageSession,
  RequestMeta,
  RevokeResult,
  RouteHandler,
  SessionHandler,
  SessionReader,
  SessionResolution,
  SessionView,
  SignInResult,
  UnlinkResult,
} from "./internal/types";
export {
  buildSessionCookie,
  carriesSessionCookie,
  clearSessionCookie,
  parseSessionTokenValue,
  readSessionToken,
  sessionCookieName,
} from "./internal/cookies";
export type { SessionCookieName } from "./internal/cookies";
export { requestMeta } from "./internal/request";
export { issueChallenge, verifySignIn } from "./internal/sign-in";
export { createSession, logout, replaceSession, resolveSession } from "./internal/sessions";
export { listSessions, revokeSession } from "./internal/session-management";
export { issueLinkChallenge, unlinkWallet, verifyLink } from "./internal/link";
export { getMe, listWallets } from "./internal/account";
export { withOrigin, withSession } from "./internal/wrappers";
export { resolvePageSession } from "./internal/page-session";
```

Replace the whole of `src/app/api/v1/auth/verify/route.ts` with:

```ts
import {
  readSessionToken,
  requestMeta,
  verifySignIn,
  withOrigin,
  type RouteHandler,
} from "@/modules/auth";
import { loadConfig } from "@/modules/config";
import { readJsonBody } from "@/modules/security";
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/verify { challengeId, signature, provider? } -> 200 { user, wallet } + Set-Cookie.
 * The request's current session cookie (if any) is passed on so sign-in replaces that session.
 */
export const POST: RouteHandler = withOrigin(async (request) => {
  const meta = requestMeta(request);
  const previousToken = readSessionToken(request, loadConfig().APP_ORIGIN);
  const result = await verifySignIn(await readJsonBody(request), meta, { previousToken });
  const response = noStoreJson(result.body, { status: 200 });
  response.headers.append("Set-Cookie", result.setCookie);
  return response;
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx vitest run tests/integration/routes/v1/session-replace.test.ts`
Expected: PASS, `Tests  6 passed`.
What would make it fail: not passing `previousToken` from the route (old token stays valid), adding a `userId` filter to the revoke (the network-switch case: the old session belongs to another user), letting `replaceSession` throw (the best-effort case expects 200 and a new cookie while a `collMod` validator rejects the revoke), or logging `err` in the warn line.

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  753 passed (753)`. Running the whole integration suite is required here: an existing test that signed in twice with one `TestClient` and expected the first session to survive would now fail (none exists today).

- [ ] **Step 6: Commit**

```bash
git add src/modules/security/internal/events.ts src/modules/auth/internal/sessions.ts src/modules/auth/internal/sign-in.ts src/modules/auth/index.ts src/app/api/v1/auth/verify/route.ts tests/integration/routes/v1/session-replace.test.ts
git commit -m "feat(auth): revoke the previous session on re-sign-in as replaced" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 6: Nonce Content-Security-Policy and security headers

Spec §9, architecture §3.6 and §6.4, decision D3. A spike proved `script-src 'self'` breaks hydration in Next 16.4.5 (inline flight scripts), so pages get a per-request nonce from `src/proxy.ts`, and the root layout calls `await connection()` so every page renders per request.

**Files:**
- Create: `src/csp.ts`, `src/proxy.ts`, `tests/unit/csp.test.ts`
- Modify: `next.config.ts`, `src/app/layout.tsx`
- Test: `tests/unit/csp.test.ts` plus a `curl` check against a production server

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createNonce(): string` (16 random bytes, base64, 24 characters) and `buildContentSecurityPolicy(nonce: string, options: { readonly dev: boolean }): string` from `@/csp`; `proxy(request: NextRequest): NextResponse` and `config.matcher` in `src/proxy.ts` (all paths except `api`, `_next/static`, `_next/image`, `favicon.ico` and prefetches); `next.config.ts` `headers()`. Task 11 replaces `src/app/layout.tsx` again (fonts, skip link, toasts) and keeps `await connection()`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/csp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/csp";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

describe("buildContentSecurityPolicy", () => {
  it("builds the exact production policy", () => {
    expect(buildContentSecurityPolicy(NONCE, { dev: false })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; ` +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
        "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; " +
        "form-action 'self'",
    );
  });

  it("adds 'unsafe-eval' to script-src only in development", () => {
    const dev = buildContentSecurityPolicy(NONCE, { dev: true });
    expect(dev).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic' 'unsafe-eval';`);
    const prod = buildContentSecurityPolicy(NONCE, { dev: false });
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("returns 24 base64 characters (16 bytes)", () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("is unique across 100 calls", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => createNonce()));
    expect(nonces.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run --project unit tests/unit/csp.test.ts`
Expected: FAIL with `Failed to resolve import "@/csp"`.

- [ ] **Step 3: Implement**

Create `src/csp.ts`:

```ts
/** 16 random bytes (Web Crypto), base64: 24 characters. A fresh value per request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The page Content-Security-Policy. Next 16 inlines flight-data scripts, so script-src needs the
 * per-request nonce; 'strict-dynamic' lets those trusted scripts load the app's chunks.
 * 'unsafe-eval' only in development (React refresh). Never upgrade-insecure-requests: it would
 * break the http://127.0.0.1 E2E origin.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  options: { readonly dev: boolean },
): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (options.dev) scriptSrc.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
```

Create `src/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "./csp";

/**
 * Next 16 proxy (formerly middleware): a per-request nonce CSP on page routes. Next reads the
 * nonce from the request's Content-Security-Policy header and applies it to its own scripts.
 */
export function proxy(request: NextRequest): NextResponse {
  const csp = buildContentSecurityPolicy(createNonce(), {
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

Replace the whole of `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** API responses never render HTML. Pages get their CSP (with a nonce) from src/proxy.ts only. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
```

Replace the whole of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "GHOST WIRE",
  description: "Your money. Your business. Your privacy.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Every page renders per request, so the proxy's CSP nonce reaches every page (spike §9.4).
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run --project unit tests/unit/csp.test.ts`
Expected: PASS, `Tests  4 passed`.
What would make it fail: adding `'unsafe-eval'` in production, adding `upgrade-insecure-requests`, or a fixed nonce (the 100-call uniqueness case).

- [ ] **Step 5: Build and check the headers on a running server**

Run:
```bash
bun run build
```
Expected: the route list shows `ƒ /` and `ƒ /_not-found` (dynamic, not `○`) and `ƒ Proxy (Middleware)`.

Then start the build with an unreachable database (boot only warns about it) on a free port and inspect the headers:
```bash
NODE_ENV=production MONGODB_URI="mongodb://127.0.0.1:1/?replicaSet=rs0" MONGODB_DB_NAME=gw_smoke APP_ORIGIN=http://127.0.0.1:3299 LOG_LEVEL=warn node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3299 > /tmp/gw-smoke.log 2>&1 &
sleep 4
curl -sD - -o /dev/null http://127.0.0.1:3299/ | grep -iE "content-security|referrer|nosniff|permissions|cache-control"
curl -sD - -o /dev/null http://127.0.0.1:3299/api/health | grep -iE "content-security|cache-control"
curl -s http://127.0.0.1:3299/ | grep -o 'nonce="[^"]*"' | head -1
kill $(ss -ltnp | grep ':3299 ' | grep -o 'pid=[0-9]*' | cut -d= -f2)
```
Expected: `/` has `content-security-policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; …; form-action 'self'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`; `/api/health` has `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` and `cache-control: no-store`; the HTML contains `nonce="…"` matching the header. Kill only the server you started (by its port); other `next-server` processes on this host are not yours. Task 17's E2E suite asserts all of this automatically.

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  757 passed (757)`.

- [ ] **Step 7: Commit**

```bash
git add src/csp.ts src/proxy.ts next.config.ts src/app/layout.tsx tests/unit/csp.test.ts
git commit -m "feat: add per-request nonce CSP proxy and security headers" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 7: wallet-connect pure pieces: the flow reducer, error classification, preview, provider id, base58

Architecture §3.1.4, §3.1.7, §3.1.8. Creates the client-only module `src/modules/wallet-connect` with its pure, framework-free parts. No file in this module has a `"use client"` directive (directives go on component entry points).

**Files:**
- Create: `src/modules/wallet-connect/index.ts`, `src/modules/wallet-connect/internal/flow.ts`, `src/modules/wallet-connect/internal/errors.ts`, `src/modules/wallet-connect/internal/challenge-preview.ts`, `src/modules/wallet-connect/internal/provider-id.ts`, `src/modules/wallet-connect/internal/base58.ts`
- Test: `tests/unit/wallet-connect/flow.test.ts`, `tests/unit/wallet-connect/errors.test.ts`, `tests/unit/wallet-connect/challenge-preview.test.ts`, `tests/unit/wallet-connect/provider-id.test.ts`, `tests/unit/wallet-connect/base58.test.ts`

**Interfaces:**
- Consumes: `type SolanaNetwork` from `@/modules/validation` (type only; the only module import client code makes besides itself); in tests, `buildSignInMessage`, `parseSolanaAddress`, `PROVIDER_PATTERN` from `@/modules/wallet` and `createTestWallet()` from `tests/helpers/ed25519.ts`.
- Produces (from `@/modules/wallet-connect`):
  - Types `FlowMode = "sign-in" | "link"`, `AccountOption { address: string; label: string | null }`, `SignPreview { domain: string; address: string; network: SolanaNetwork }`, `FlowFailureCode = "AUTH_FAILED" | "WALLET_ALREADY_LINKED" | "NETWORK_UNSUPPORTED" | "UNREACHABLE" | "OTHER"`, `FlowState` (discriminated by `status`: `idle`, `connecting {walletName}`, `choosing-account {walletName, accounts}`, `challenging {address}`, `awaiting-signature {preview}`, `verifying {address}`, `done {address, network}`, `rejected`, `disconnected`, `account-changed`, `rate-limited {retryAt}` (epoch ms), `failed {code, message}`; every state has `attemptId: number`), `FlowStatus`, `FlowEvent` (`start`, `choose-account`, `account-selected`, `challenge-issued`, `signed`, `verified`, `wallet-error {kind}`, `api-error {code, message, retryAt?}`, `account-changed`, `reset`).
  - `initialFlowState: FlowState` (`{ status: "idle", attemptId: 0 }`), `isInFlight(state): boolean`, `toFailureCode(apiCode: string): FlowFailureCode`, `reduce(state: FlowState, event: FlowEvent): FlowState` (pure; any pair outside the table returns the same object; stale `attemptId` ignored; `start` only with a higher id).
  - `classifyWalletError(error: unknown): WalletErrorKind` where `WalletErrorKind = "rejected" | "disconnected" | "other"`.
  - `parseChallengePreview(message: string, expected: { domain; address; network }): SignPreview | null`.
  - `toProviderId(walletName: string): string | undefined`.
  - `encodeBase58(bytes: Uint8Array): string` (the second and last `bs58` import, lint rule R6).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/wallet-connect/flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  initialFlowState,
  isInFlight,
  reduce,
  toFailureCode,
  type AccountOption,
  type FlowEvent,
  type FlowState,
  type FlowStatus,
} from "@/modules/wallet-connect";

const A = 1;
const ACCOUNTS: readonly AccountOption[] = [
  { address: "Addr1", label: null },
  { address: "Addr2", label: "Second" },
];
const PREVIEW = { domain: "localhost:3000", address: "Addr1", network: "devnet" } as const;

/** One state per status, all in attempt 1. Fresh objects per call so identity checks are real. */
function states(): Record<FlowStatus, FlowState> {
  return {
    idle: { status: "idle", attemptId: A },
    connecting: { status: "connecting", attemptId: A, walletName: "Fake" },
    "choosing-account": {
      status: "choosing-account",
      attemptId: A,
      walletName: "Fake",
      accounts: ACCOUNTS,
    },
    challenging: { status: "challenging", attemptId: A, address: "Addr1" },
    "awaiting-signature": { status: "awaiting-signature", attemptId: A, preview: PREVIEW },
    verifying: { status: "verifying", attemptId: A, address: "Addr1" },
    done: { status: "done", attemptId: A, address: "Addr1", network: "devnet" },
    rejected: { status: "rejected", attemptId: A },
    disconnected: { status: "disconnected", attemptId: A },
    "account-changed": { status: "account-changed", attemptId: A },
    "rate-limited": { status: "rate-limited", attemptId: A, retryAt: 5_000 },
    failed: { status: "failed", attemptId: A, code: "OTHER", message: "x" },
  };
}

type AttemptEventType = Exclude<FlowEvent["type"], "start" | "reset">;

function events(attemptId: number): Record<AttemptEventType, FlowEvent> {
  return {
    "choose-account": { type: "choose-account", attemptId, accounts: ACCOUNTS },
    "account-selected": { type: "account-selected", attemptId, address: "Addr2" },
    "challenge-issued": { type: "challenge-issued", attemptId, preview: PREVIEW },
    signed: { type: "signed", attemptId },
    verified: { type: "verified", attemptId, address: "Addr1", network: "mainnet-beta" },
    "wallet-error": { type: "wallet-error", attemptId, kind: "rejected" },
    "api-error": { type: "api-error", attemptId, code: "AUTH_FAILED", message: "m" },
    "account-changed": { type: "account-changed", attemptId },
  };
}

const STATUSES = Object.keys(states()) as FlowStatus[];
const EVENT_TYPES = Object.keys(events(A)) as AttemptEventType[];

/** The transition table's (from, event) pairs; everything else must return the same object. */
const ACCEPTED = new Set<string>([
  "connecting|choose-account",
  "connecting|account-selected",
  "choosing-account|account-selected",
  "challenging|challenge-issued",
  "awaiting-signature|signed",
  "verifying|verified",
  "connecting|wallet-error",
  "choosing-account|wallet-error",
  "challenging|wallet-error",
  "awaiting-signature|wallet-error",
  "challenging|api-error",
  "verifying|api-error",
  "choosing-account|account-changed",
  "challenging|account-changed",
  "awaiting-signature|account-changed",
]);

describe("reduce: transition table rows", () => {
  it.each<{ from: FlowStatus; event: FlowEvent; to: FlowState }>([
    {
      from: "connecting",
      event: { type: "choose-account", attemptId: A, accounts: ACCOUNTS },
      to: { status: "choosing-account", attemptId: A, walletName: "Fake", accounts: ACCOUNTS },
    },
    {
      from: "connecting",
      event: { type: "choose-account", attemptId: A, accounts: [ACCOUNTS[0] as AccountOption] },
      to: { status: "failed", attemptId: A, code: "OTHER", message: "no accounts" },
    },
    {
      from: "connecting",
      event: { type: "account-selected", attemptId: A, address: "Addr9" },
      to: { status: "challenging", attemptId: A, address: "Addr9" },
    },
    {
      from: "choosing-account",
      event: { type: "account-selected", attemptId: A, address: "Addr2" },
      to: { status: "challenging", attemptId: A, address: "Addr2" },
    },
    {
      from: "challenging",
      event: { type: "challenge-issued", attemptId: A, preview: PREVIEW },
      to: { status: "awaiting-signature", attemptId: A, preview: PREVIEW },
    },
    {
      from: "awaiting-signature",
      event: { type: "signed", attemptId: A },
      to: { status: "verifying", attemptId: A, address: "Addr1" },
    },
    {
      from: "verifying",
      event: { type: "verified", attemptId: A, address: "Addr1", network: "mainnet-beta" },
      to: { status: "done", attemptId: A, address: "Addr1", network: "mainnet-beta" },
    },
    ...(["connecting", "choosing-account", "challenging", "awaiting-signature"] as const).flatMap(
      (from) => [
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "rejected" } as const,
          to: { status: "rejected", attemptId: A } as const,
        },
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "disconnected" } as const,
          to: { status: "disconnected", attemptId: A } as const,
        },
        {
          from,
          event: { type: "wallet-error", attemptId: A, kind: "other" } as const,
          to: { status: "failed", attemptId: A, code: "OTHER", message: "wallet error" } as const,
        },
      ],
    ),
    ...(["challenging", "verifying"] as const).flatMap((from) => [
      {
        from,
        event: {
          type: "api-error",
          attemptId: A,
          code: "RATE_LIMITED",
          message: "m",
          retryAt: 9_000,
        } as const,
        to: { status: "rate-limited", attemptId: A, retryAt: 9_000 } as const,
      },
      {
        from,
        event: { type: "api-error", attemptId: A, code: "RATE_LIMITED", message: "m" } as const,
        to: { status: "failed", attemptId: A, code: "OTHER", message: "m" } as const,
      },
      {
        from,
        event: {
          type: "api-error",
          attemptId: A,
          code: "DEPENDENCY_UNAVAILABLE",
          message: "m",
        } as const,
        to: { status: "failed", attemptId: A, code: "UNREACHABLE", message: "m" } as const,
      },
    ]),
    ...(["choosing-account", "challenging", "awaiting-signature"] as const).map((from) => ({
      from,
      event: { type: "account-changed", attemptId: A } as const,
      to: { status: "account-changed", attemptId: A } as const,
    })),
  ])("$from + $event.type → $to.status", ({ from, event, to }) => {
    expect(reduce(states()[from], event)).toEqual(to);
  });

  it("ignores an account-selected address that is not in the picker list", () => {
    const state = states()["choosing-account"];
    expect(reduce(state, { type: "account-selected", attemptId: A, address: "Nope" })).toBe(state);
  });

  it("ignores wallet events once verifying (a session may already be created)", () => {
    const state = states().verifying;
    expect(reduce(state, { type: "wallet-error", attemptId: A, kind: "disconnected" })).toBe(state);
    expect(reduce(state, { type: "account-changed", attemptId: A })).toBe(state);
  });
});

describe("reduce: every pair outside the table returns the same object", () => {
  const pairs = STATUSES.flatMap((status) =>
    EVENT_TYPES.filter((type) => !ACCEPTED.has(`${status}|${type}`)).map((type) => ({
      status,
      type,
    })),
  );

  it("has a non-trivial matrix (control)", () => {
    expect(pairs.length).toBe(STATUSES.length * EVENT_TYPES.length - ACCEPTED.size);
    expect(pairs.length).toBeGreaterThan(70);
  });

  it.each(pairs)("$status + $type", ({ status, type }) => {
    const state = states()[status];
    expect(reduce(state, events(A)[type])).toBe(state);
  });
});

describe("reduce: stale attempts", () => {
  const accepted = [...ACCEPTED].map((key) => {
    const [status, type] = key.split("|") as [FlowStatus, AttemptEventType];
    return { status, type };
  });

  it.each(accepted)("ignores $type from another attempt in $status", ({ status, type }) => {
    const state = states()[status];
    expect(reduce(state, events(A + 1)[type])).toBe(state);
    expect(reduce(state, events(A - 1)[type])).toBe(state);
  });

  it.each(STATUSES)("start with a higher id from %s begins connecting", (status) => {
    expect(reduce(states()[status], { type: "start", attemptId: 2, walletName: "W" })).toEqual({
      status: "connecting",
      attemptId: 2,
      walletName: "W",
    });
  });

  it.each(STATUSES)("start with an equal or lower id is ignored in %s", (status) => {
    const state = states()[status];
    expect(reduce(state, { type: "start", attemptId: A, walletName: "W" })).toBe(state);
    expect(reduce(state, { type: "start", attemptId: 0, walletName: "W" })).toBe(state);
  });

  it.each(STATUSES)("reset from %s returns idle with the same attemptId", (status) => {
    expect(reduce(states()[status], { type: "reset" })).toEqual({ status: "idle", attemptId: A });
  });
});

describe("initialFlowState, isInFlight, toFailureCode", () => {
  it("starts idle at attempt 0", () => {
    expect(initialFlowState).toEqual({ status: "idle", attemptId: 0 });
  });

  it("is in flight only while a request or wallet prompt is pending", () => {
    const inFlight = STATUSES.filter((status) => isInFlight(states()[status]));
    expect(inFlight).toEqual([
      "connecting",
      "choosing-account",
      "challenging",
      "awaiting-signature",
      "verifying",
    ]);
  });

  it.each([
    ["AUTH_FAILED", "AUTH_FAILED"],
    ["WALLET_ALREADY_LINKED", "WALLET_ALREADY_LINKED"],
    ["NETWORK_UNSUPPORTED", "NETWORK_UNSUPPORTED"],
    ["DEPENDENCY_UNAVAILABLE", "UNREACHABLE"],
    ["NETWORK", "UNREACHABLE"],
    ["INTERNAL", "OTHER"],
    ["UNEXPECTED_RESPONSE", "OTHER"],
    ["VALIDATION_FAILED", "OTHER"],
    ["", "OTHER"],
  ])("maps %s to %s", (code, expected) => {
    expect(toFailureCode(code)).toBe(expected);
  });
});
```

Create `tests/unit/wallet-connect/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyWalletError } from "@/modules/wallet-connect";

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** cause chain with the innermost value at `depth` (1 = the value itself). */
function nested(depth: number, inner: unknown): unknown {
  let value = inner;
  for (let i = 1; i < depth; i += 1) value = { cause: value };
  return value;
}

describe("classifyWalletError", () => {
  it.each<[string, unknown]>([
    ["code 4001", { code: 4001 }],
    ["code '4001'", { code: "4001" }],
    ["standard Error + code 4001", Object.assign(new Error("x"), { code: 4001 })],
    ["Phantom plain object", { code: 4001, message: "User rejected the request." }],
    [
      "Solflare WalletSignMessageError",
      named("WalletSignMessageError", "User rejected the request"),
    ],
    ["wrapped .error", { name: "WalletSignMessageError", error: { code: 4001 } }],
    ["Error cause", new Error("x", { cause: { code: 4001 } })],
    ["Approval Denied", new Error("Approval Denied")],
    ["Transaction cancelled", new Error("Transaction cancelled")],
    ["UserRejectedRequestError", named("UserRejectedRequestError", "")],
    ["rejection at depth 5", nested(5, { code: 4001 })],
  ])("rejected: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("rejected");
  });

  it.each<[string, unknown]>([
    ["WalletDisconnectedError", named("WalletDisconnectedError", "")],
    ["WalletNotConnectedError", named("WalletNotConnectedError", "")],
    ["Wallet not connected", new Error("Wallet not connected")],
    ["the string 'disconnected'", "disconnected"],
  ])("disconnected: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("disconnected");
  });

  it.each<[string, unknown]>([
    ["TypeError", new TypeError("x")],
    ["a plain string", "boom"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an empty object", {}],
    ["rejection at depth 6 (walk stops at 5)", nested(6, { code: 4001 })],
  ])("other: %s", (_label, error) => {
    expect(classifyWalletError(error)).toBe("other");
  });

  it("terminates on a self-referential cause cycle", () => {
    const a: { cause?: unknown; message: string } = { message: "a" };
    const b = { cause: a, message: "b" };
    a.cause = b;
    expect(classifyWalletError(a)).toBe("other");
  });

  it("prefers rejection over disconnect within one node", () => {
    expect(classifyWalletError(new Error("User rejected; wallet disconnected"))).toBe("rejected");
  });
});
```

Create `tests/unit/wallet-connect/challenge-preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSignInMessage, parseSolanaAddress, type SolanaAddress } from "@/modules/wallet";
import { parseChallengePreview } from "@/modules/wallet-connect";
import { createTestWallet } from "../../helpers/ed25519";

const wallet = createTestWallet();
const address = parseSolanaAddress(wallet.address) as SolanaAddress;
const EXPECTED = { domain: "ghostwire.test", address: wallet.address, network: "devnet" } as const;

function message(overrides: { domain?: string; network?: "devnet" | "mainnet-beta" } = {}) {
  return buildSignInMessage({
    purpose: "signin",
    domain: overrides.domain ?? "ghostwire.test",
    address,
    uri: "https://ghostwire.test",
    network: overrides.network ?? "devnet",
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    issuedAt: new Date("2026-11-13T10:00:00.000Z"),
    expiresAt: new Date("2026-11-13T10:05:00.000Z"),
  });
}

describe("parseChallengePreview", () => {
  it("accepts a real 02a message and returns the preview", () => {
    expect(parseChallengePreview(message(), EXPECTED)).toEqual(EXPECTED);
  });

  it("accepts the link message layout too", () => {
    const link = message().replace(
      "Sign in to GHOST WIRE.",
      "Link this wallet to your GHOST WIRE account.",
    );
    expect(parseChallengePreview(link, EXPECTED)).toEqual(EXPECTED);
  });

  it.each([
    ["another domain", message({ domain: "evil.test" })],
    ["another network", message({ network: "mainnet-beta" })],
    ["another address", message().replace(wallet.address, createTestWallet().address)],
    ["no Chain ID line", message().replace("Chain ID: solana:devnet\n", "")],
    ["CRLF line endings", message().replaceAll("\n", "\r\n")],
    ["an empty string", ""],
  ])("rejects %s", (_label, text) => {
    expect(parseChallengePreview(text, EXPECTED)).toBeNull();
  });
});
```

Create `tests/unit/wallet-connect/provider-id.test.ts`:

```ts
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
```

Create `tests/unit/wallet-connect/base58.test.ts`:

```ts
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { encodeBase58 } from "@/modules/wallet-connect";

describe("encodeBase58", () => {
  it("round-trips through bs58.decode", () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 37) % 256);
    expect(bs58.decode(encodeBase58(bytes))).toEqual(bytes);
  });

  it("keeps leading zero bytes as leading 1s", () => {
    expect(encodeBase58(new Uint8Array([0, 0, 1]))).toBe("112");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project unit tests/unit/wallet-connect`
Expected: FAIL, every file with `Failed to resolve import "@/modules/wallet-connect"`.

- [ ] **Step 3: Implement**

Create `src/modules/wallet-connect/internal/flow.ts`:

```ts
import type { SolanaNetwork } from "@/modules/validation";

export type FlowMode = "sign-in" | "link";

export interface AccountOption {
  readonly address: string;
  readonly label: string | null;
}

export interface SignPreview {
  readonly domain: string;
  readonly address: string;
  readonly network: SolanaNetwork;
}

export type FlowFailureCode =
  "AUTH_FAILED" | "WALLET_ALREADY_LINKED" | "NETWORK_UNSUPPORTED" | "UNREACHABLE" | "OTHER";

interface Base {
  readonly attemptId: number;
}

export type FlowState =
  | (Base & { readonly status: "idle" })
  | (Base & { readonly status: "connecting"; readonly walletName: string })
  | (Base & {
      readonly status: "choosing-account";
      readonly walletName: string;
      readonly accounts: readonly AccountOption[];
    })
  | (Base & { readonly status: "challenging"; readonly address: string })
  | (Base & { readonly status: "awaiting-signature"; readonly preview: SignPreview })
  | (Base & { readonly status: "verifying"; readonly address: string })
  | (Base & { readonly status: "done"; readonly address: string; readonly network: SolanaNetwork })
  | (Base & { readonly status: "rejected" })
  | (Base & { readonly status: "disconnected" })
  | (Base & { readonly status: "account-changed" })
  /** retryAt is epoch milliseconds. */
  | (Base & { readonly status: "rate-limited"; readonly retryAt: number })
  | (Base & {
      readonly status: "failed";
      readonly code: FlowFailureCode;
      readonly message: string;
    });

export type FlowStatus = FlowState["status"];

export type FlowEvent =
  | { readonly type: "start"; readonly attemptId: number; readonly walletName: string }
  | {
      readonly type: "choose-account";
      readonly attemptId: number;
      readonly accounts: readonly AccountOption[];
    }
  | { readonly type: "account-selected"; readonly attemptId: number; readonly address: string }
  | { readonly type: "challenge-issued"; readonly attemptId: number; readonly preview: SignPreview }
  | { readonly type: "signed"; readonly attemptId: number }
  | {
      readonly type: "verified";
      readonly attemptId: number;
      readonly address: string;
      readonly network: SolanaNetwork;
    }
  | {
      readonly type: "wallet-error";
      readonly attemptId: number;
      readonly kind: "rejected" | "disconnected" | "other";
    }
  | {
      readonly type: "api-error";
      readonly attemptId: number;
      readonly code: string;
      readonly message: string;
      readonly retryAt?: number;
    }
  | { readonly type: "account-changed"; readonly attemptId: number }
  | { readonly type: "reset" };

export const initialFlowState: FlowState = { status: "idle", attemptId: 0 };

const IN_FLIGHT: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "connecting",
  "choosing-account",
  "challenging",
  "awaiting-signature",
  "verifying",
]);
/** Wallet events are not accepted in verifying: the server may already be creating the session. */
const WALLET_ERROR_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "connecting",
  "choosing-account",
  "challenging",
  "awaiting-signature",
]);
const API_ERROR_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>(["challenging", "verifying"]);
const ACCOUNT_CHANGED_FROM: ReadonlySet<FlowStatus> = new Set<FlowStatus>([
  "choosing-account",
  "challenging",
  "awaiting-signature",
]);

/** connecting | choosing-account | challenging | awaiting-signature | verifying */
export function isInFlight(state: FlowState): boolean {
  return IN_FLIGHT.has(state.status);
}

/**
 * AUTH_FAILED, WALLET_ALREADY_LINKED and NETWORK_UNSUPPORTED are kept; DEPENDENCY_UNAVAILABLE
 * and NETWORK become UNREACHABLE; anything else is OTHER.
 */
export function toFailureCode(apiCode: string): FlowFailureCode {
  switch (apiCode) {
    case "AUTH_FAILED":
    case "WALLET_ALREADY_LINKED":
    case "NETWORK_UNSUPPORTED":
      return apiCode;
    case "DEPENDENCY_UNAVAILABLE":
    case "NETWORK":
      return "UNREACHABLE";
    default:
      return "OTHER";
  }
}

/**
 * Pure and total. Every (state, event) pair outside the architecture §3.1.4 transition table
 * returns the SAME state object. Events other than start and reset from another attempt are
 * ignored; start is accepted only with a strictly higher attemptId.
 */
export function reduce(state: FlowState, event: FlowEvent): FlowState {
  if (event.type === "reset") return { status: "idle", attemptId: state.attemptId };
  if (event.type === "start") {
    if (event.attemptId <= state.attemptId) return state;
    return { status: "connecting", attemptId: event.attemptId, walletName: event.walletName };
  }
  if (event.attemptId !== state.attemptId) return state;
  const attemptId = state.attemptId;
  switch (event.type) {
    case "choose-account":
      if (state.status !== "connecting") return state;
      if (event.accounts.length < 2) {
        return { status: "failed", attemptId, code: "OTHER", message: "no accounts" };
      }
      return {
        status: "choosing-account",
        attemptId,
        walletName: state.walletName,
        accounts: event.accounts,
      };
    case "account-selected":
      if (state.status === "connecting") {
        return { status: "challenging", attemptId, address: event.address };
      }
      if (
        state.status === "choosing-account" &&
        state.accounts.some((account) => account.address === event.address)
      ) {
        return { status: "challenging", attemptId, address: event.address };
      }
      return state;
    case "challenge-issued":
      if (state.status !== "challenging") return state;
      return { status: "awaiting-signature", attemptId, preview: event.preview };
    case "signed":
      if (state.status !== "awaiting-signature") return state;
      return { status: "verifying", attemptId, address: state.preview.address };
    case "verified":
      if (state.status !== "verifying") return state;
      return { status: "done", attemptId, address: event.address, network: event.network };
    case "wallet-error":
      if (!WALLET_ERROR_FROM.has(state.status)) return state;
      if (event.kind === "rejected") return { status: "rejected", attemptId };
      if (event.kind === "disconnected") return { status: "disconnected", attemptId };
      return { status: "failed", attemptId, code: "OTHER", message: "wallet error" };
    case "api-error":
      if (!API_ERROR_FROM.has(state.status)) return state;
      if (event.code === "RATE_LIMITED" && event.retryAt !== undefined) {
        return { status: "rate-limited", attemptId, retryAt: event.retryAt };
      }
      return {
        status: "failed",
        attemptId,
        code: toFailureCode(event.code),
        message: event.message,
      };
    case "account-changed":
      if (!ACCOUNT_CHANGED_FROM.has(state.status)) return state;
      return { status: "account-changed", attemptId };
  }
}
```

Create `src/modules/wallet-connect/internal/errors.ts`:

```ts
export type WalletErrorKind = "rejected" | "disconnected" | "other";

const REJECTED = /reject|denied|cancel/i;
const DISCONNECTED = /disconnect|not ?connected/i;
const MAX_DEPTH = 5;

/** The node itself when it is a string, else "name message" when either is a string. */
function textOf(node: object | string): string | null {
  if (typeof node === "string") return node;
  const { name, message } = node as { name?: unknown; message?: unknown };
  if (typeof name !== "string" && typeof message !== "string") return null;
  return `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`;
}

function kindOf(node: object | string): WalletErrorKind | null {
  if (typeof node === "object") {
    const code = (node as { code?: unknown }).code;
    if (code === 4001 || code === "4001") return "rejected";
  }
  const text = textOf(node);
  if (text === null) return null;
  if (REJECTED.test(text)) return "rejected";
  if (DISCONNECTED.test(text)) return "disconnected";
  return null;
}

/**
 * Classifies a wallet error by walking the value, then `.cause`, then `.error` (how
 * wallet-adapter-style wrappers nest the inner error), breadth-first, at most 5 levels deep,
 * never visiting a node twice. The first matching node decides; within a node, rejection wins.
 * Code 4001 (EIP-1193 user rejection, used by Phantom) or text matching /reject|denied|cancel/i
 * is "rejected"; text matching /disconnect|not ?connected/i is "disconnected"; else "other".
 */
export function classifyWalletError(error: unknown): WalletErrorKind {
  const visited = new Set<unknown>();
  let level: unknown[] = [error];
  for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth += 1) {
    const next: unknown[] = [];
    for (const node of level) {
      if ((typeof node !== "object" && typeof node !== "string") || node === null) continue;
      if (visited.has(node)) continue;
      visited.add(node);
      const kind = kindOf(node);
      if (kind !== null) return kind;
      if (typeof node === "object") {
        const { cause, error: inner } = node as { cause?: unknown; error?: unknown };
        next.push(cause, inner);
      }
    }
    level = next;
  }
  return "other";
}
```

Create `src/modules/wallet-connect/internal/challenge-preview.ts`:

```ts
import type { SolanaNetwork } from "@/modules/validation";
import type { SignPreview } from "./flow";

const HEADER_SUFFIX = " wants you to sign in with your Solana account:";

/**
 * Reads the 02a sign-in message (ADR-0006 layout, "\n" line endings): line 0 must be
 * `${expected.domain} wants you to sign in with your Solana account:`, line 1 must equal
 * expected.address, and a line `Chain ID: solana:${expected.network}` must be present.
 * Returns the preview or null on any mismatch (a CR anywhere included). Defense in depth: never
 * show or sign a message that names another domain, account or network.
 */
export function parseChallengePreview(
  message: string,
  expected: {
    readonly domain: string;
    readonly address: string;
    readonly network: SolanaNetwork;
  },
): SignPreview | null {
  if (message.includes("\r")) return null;
  const lines = message.split("\n");
  if (lines[0] !== `${expected.domain}${HEADER_SUFFIX}`) return null;
  if (lines[1] !== expected.address) return null;
  if (!lines.includes(`Chain ID: solana:${expected.network}`)) return null;
  return { domain: expected.domain, address: expected.address, network: expected.network };
}
```

Create `src/modules/wallet-connect/internal/provider-id.ts`:

```ts
const MAX_LENGTH = 32;

/**
 * A wallet's display name as the server's provider id (PROVIDER_PATTERN /^[a-z0-9_-]{1,32}$/):
 * lowercase, every run of other characters becomes "-", leading and trailing "-" trimmed, cut
 * to 32 characters. "Phantom" → "phantom". undefined when nothing is left.
 */
export function toProviderId(walletName: string): string | undefined {
  const id = walletName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH);
  return id === "" ? undefined : id;
}
```

Create `src/modules/wallet-connect/internal/base58.ts`:

```ts
import bs58 from "bs58";

/** bs58.encode. The only bs58 import in client code (lint R6). */
export function encodeBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}
```

Create `src/modules/wallet-connect/index.ts`:

```ts
export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption,
  FlowEvent,
  FlowFailureCode,
  FlowMode,
  FlowState,
  FlowStatus,
  SignPreview,
} from "./internal/flow";
export { classifyWalletError } from "./internal/errors";
export type { WalletErrorKind } from "./internal/errors";
export { parseChallengePreview } from "./internal/challenge-preview";
export { toProviderId } from "./internal/provider-id";
export { encodeBase58 } from "./internal/base58";
```

- [ ] **Step 4: Run to verify they pass**

Run: `bunx vitest run --project unit tests/unit/wallet-connect`
Expected: PASS, `Tests  216 passed`.
What would make it fail: accepting `wallet-error` in `verifying` (a late disconnect would show "disconnected" while the session cookie is being set), returning a new object for an ignored pair (the matrix uses `toBe`), or dropping the stale-attempt check.

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  973 passed (973)`. Lint proves the new module obeys the client rules (only `@/modules/validation` among modules, `bs58` only in `base58.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/modules/wallet-connect tests/unit/wallet-connect/flow.test.ts tests/unit/wallet-connect/errors.test.ts tests/unit/wallet-connect/challenge-preview.test.ts tests/unit/wallet-connect/provider-id.test.ts tests/unit/wallet-connect/base58.test.ts
git commit -m "feat(wallet-connect): add flow reducer, wallet error classification and preview checks" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 8: Typed `/api/v1` client with `zod/mini` response schemas

Architecture §3.1.9 and §3.1.10. Every function resolves to an `ApiResult` and never throws. Adds the `fetch` stub used by every later client test.

**Files:**
- Create: `src/modules/wallet-connect/internal/schemas.ts`, `src/modules/wallet-connect/internal/api-client.ts`, `tests/helpers/fake-api.ts`, `tests/unit/wallet-connect/api-client.test.ts`
- Modify: `src/modules/wallet-connect/index.ts`
- Test: `tests/unit/wallet-connect/api-client.test.ts`

**Interfaces:**
- Consumes: `type SolanaNetwork` (`@/modules/validation`); in the helper, `buildSignInMessage` and `type SolanaAddress` from `@/modules/wallet`.
- Produces (from `@/modules/wallet-connect`):
  - `ApiFailure { ok: false; code: string; message: string; retryAfter?: number }`, `ApiResult<T> = { ok: true; data: T } | ApiFailure`, `RequestOptions { signal?: AbortSignal }`.
  - `challenge({ address, network }, options?) → ApiResult<ChallengeData>`; `verify({ challengeId, signature, provider? }, options?) → ApiResult<SignInData>`; `logout(options?) → ApiResult<null>`; `me(options?) → ApiResult<MeData>`; `listWallets(options?) → ApiResult<readonly WalletItem[]>`; `linkChallenge(...)` like `challenge`; `linkVerify(...) → ApiResult<LinkData>` (`created` is true on 201); `unlinkWallet(walletId, options?) → ApiResult<null>`; `listSessions(options?) → ApiResult<readonly SessionItem[]>`; `revokeSession(sessionId, options?) → ApiResult<null>`; `interface ApiClient` (the ten as readonly properties) and `apiClient: ApiClient`; `onUnauthenticated(handler: () => void): () => void` (one global slot; the unregister clears it only if it still holds that handler).
  - Types `ChallengeData { challengeId; message; expiresAt }`, `SignInData { user: { id }; wallet: { id; address; network } }`, `WalletItem { id; address; network; provider: string | null; status: "active" | "disconnected"; linkedAt }`, `LinkData { wallet: WalletItem; created: boolean }`, `MeData { user: { id; createdAt }; session: { id; network; expiresAt }; wallets: WalletItem[] }`, `SessionItem { id; current; createdAt; lastSeenAt; expiresAt; network; userAgent: string | null }`.
  - Client codes: `NETWORK` (fetch rejected), `ABORTED` (fetch rejected after the signal aborted; never shown), `UNEXPECTED_RESPONSE` (non-JSON, schema mismatch, wrong 2xx); 429 `retryAfter` = `Retry-After` clamped to 1–3600, 60 when missing or invalid; a non-ObjectId id for unlink/revoke returns `VALIDATION_FAILED` without calling `fetch`.
  - `tests/helpers/fake-api.ts`: `type ApiRouteKey` (the ten `"METHOD /api/v1/…"` keys, `:id` for the two DELETEs), `type FakeHandler = (request: Request, params: { id?: string }) => Response | Promise<Response>`, `mockApi(handlers): FakeApi` (`{ requests: readonly Request[]; restore(): void }`; stubs `fetch` with `vi.stubGlobal`; unknown routes answer 500 `INTERNAL`; an aborted signal rejects with `AbortError` even while a handler hangs), `json(status, body, headers?)`, `noContent()`, `challengeFor({ address, network, domain?, purpose? })` (a real 02a message; `domain` defaults to happy-dom's `localhost:3000`).

- [ ] **Step 1: Write the fetch stub helper**

Create `tests/helpers/fake-api.ts`:

```ts
import { vi } from "vitest";
import { buildSignInMessage, type SolanaAddress, type SolanaNetwork } from "@/modules/wallet";

export type ApiRouteKey =
  | "POST /api/v1/auth/challenge"
  | "POST /api/v1/auth/verify"
  | "POST /api/v1/auth/logout"
  | "GET /api/v1/me"
  | "GET /api/v1/wallets"
  | "POST /api/v1/wallets/link/challenge"
  | "POST /api/v1/wallets/link/verify"
  | "DELETE /api/v1/wallets/:id"
  | "GET /api/v1/sessions"
  | "DELETE /api/v1/sessions/:id";

export type FakeHandler = (
  request: Request,
  params: { readonly id?: string },
) => Response | Promise<Response>;

export interface FakeApi {
  /** Clones of every request fetch received, in order (bodies still readable). */
  readonly requests: readonly Request[];
  restore(): void;
}

/** happy-dom's default location; relative fetch paths resolve against it in node too. */
const BASE = "http://localhost:3000";

const EXACT: ReadonlySet<string> = new Set<ApiRouteKey>([
  "POST /api/v1/auth/challenge",
  "POST /api/v1/auth/verify",
  "POST /api/v1/auth/logout",
  "GET /api/v1/me",
  "GET /api/v1/wallets",
  "POST /api/v1/wallets/link/challenge",
  "POST /api/v1/wallets/link/verify",
  "GET /api/v1/sessions",
]);

function route(method: string, pathname: string): { key: ApiRouteKey | null; id?: string } {
  const exact = `${method} ${pathname}`;
  if (EXACT.has(exact)) return { key: exact as ApiRouteKey };
  const wallet = /^\/api\/v1\/wallets\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && wallet !== null && wallet[1] !== "link") {
    return { key: "DELETE /api/v1/wallets/:id", id: decodeURIComponent(wallet[1] ?? "") };
  }
  const session = /^\/api\/v1\/sessions\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && session !== null) {
    return { key: "DELETE /api/v1/sessions/:id", id: decodeURIComponent(session[1] ?? "") };
  }
  return { key: null };
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Stubs globalThis.fetch with vi.stubGlobal. Each call is routed by method and path to a
 * handler; unknown routes return 500 { code: "INTERNAL" } and are recorded too. An aborted
 * signal rejects with an AbortError like real fetch, even while a handler is still pending.
 */
export function mockApi(handlers: Partial<Record<ApiRouteKey, FakeHandler>>): FakeApi {
  const requests: Request[] = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((resolve, reject) => {
        const abortError = () => new DOMException("The operation was aborted.", "AbortError");
        const signal = init?.signal ?? undefined;
        if (signal?.aborted === true) {
          reject(abortError());
          return;
        }
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
        const url = input instanceof Request ? input.url : String(input);
        const request = new Request(new URL(url, BASE), {
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
          credentials: init?.credentials,
          cache: init?.cache,
        });
        requests.push(request.clone());
        const { key, id } = route(request.method, new URL(request.url).pathname);
        const handler = key === null ? undefined : handlers[key];
        if (handler === undefined) {
          resolve(json(500, { code: "INTERNAL", message: "Internal error" }));
          return;
        }
        Promise.resolve(handler(request, id === undefined ? {} : { id })).then(resolve, reject);
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    restore: () => {
      vi.unstubAllGlobals();
    },
  };
}

let challengeCounter = 0;

/**
 * A challenge whose message is the real 02a layout for the given domain, address and network.
 * domain defaults to happy-dom's "localhost:3000". The id is a fresh 24-hex string.
 */
export function challengeFor(input: {
  readonly address: string;
  readonly network: SolanaNetwork;
  readonly domain?: string;
  readonly purpose?: "signin" | "link";
}): { challengeId: string; message: string; expiresAt: string } {
  challengeCounter += 1;
  const issuedAt = new Date("2026-11-13T10:00:00.000Z");
  const expiresAt = new Date("2026-11-13T10:05:00.000Z");
  const domain = input.domain ?? "localhost:3000";
  const message = buildSignInMessage({
    purpose: input.purpose ?? "signin",
    domain,
    address: input.address as SolanaAddress,
    uri: `http://${domain}`,
    network: input.network,
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    issuedAt,
    expiresAt,
  });
  return {
    challengeId: challengeCounter.toString(16).padStart(24, "0"),
    message,
    expiresAt: expiresAt.toISOString(),
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/wallet-connect/api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOLANA_NETWORK_IDS } from "@/modules/validation";
import {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
  type ApiResult,
} from "@/modules/wallet-connect";
import { json, mockApi, noContent, type FakeApi } from "../../helpers/fake-api";

const ID = "a".repeat(24);
const ID2 = "b".repeat(24);
const ISO = "2026-11-13T10:00:00.000Z";
const WALLET = {
  id: ID,
  address: "Addr1",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: ISO,
} as const;
const SESSION = {
  id: ID2,
  current: true,
  createdAt: ISO,
  lastSeenAt: ISO,
  expiresAt: ISO,
  network: "devnet",
  userAgent: null,
} as const;
const CHALLENGE = { challengeId: ID, message: "m", expiresAt: ISO };

let api: FakeApi | null = null;
let unregister: (() => void) | null = null;

afterEach(() => {
  api?.restore();
  api = null;
  unregister?.();
  unregister = null;
});

function only(): Request {
  expect(api?.requests).toHaveLength(1);
  return api?.requests[0] as Request;
}

describe("requests", () => {
  it.each<{
    name: string;
    call: () => Promise<ApiResult<unknown>>;
    method: string;
    path: string;
    body: unknown;
  }>([
    {
      name: "challenge",
      call: () => challenge({ address: "Addr1", network: "devnet" }),
      method: "POST",
      path: "/api/v1/auth/challenge",
      body: { address: "Addr1", network: "devnet" },
    },
    {
      name: "verify",
      call: () => verify({ challengeId: ID, signature: "sig", provider: "phantom" }),
      method: "POST",
      path: "/api/v1/auth/verify",
      body: { challengeId: ID, signature: "sig", provider: "phantom" },
    },
    {
      name: "verify without provider",
      call: () => verify({ challengeId: ID, signature: "sig" }),
      method: "POST",
      path: "/api/v1/auth/verify",
      body: { challengeId: ID, signature: "sig" },
    },
    {
      name: "logout",
      call: () => logout(),
      method: "POST",
      path: "/api/v1/auth/logout",
      body: null,
    },
    { name: "me", call: () => me(), method: "GET", path: "/api/v1/me", body: null },
    {
      name: "listWallets",
      call: () => listWallets(),
      method: "GET",
      path: "/api/v1/wallets",
      body: null,
    },
    {
      name: "linkChallenge",
      call: () => linkChallenge({ address: "Addr2", network: "mainnet-beta" }),
      method: "POST",
      path: "/api/v1/wallets/link/challenge",
      body: { address: "Addr2", network: "mainnet-beta" },
    },
    {
      name: "linkVerify",
      call: () => linkVerify({ challengeId: ID, signature: "sig" }),
      method: "POST",
      path: "/api/v1/wallets/link/verify",
      body: { challengeId: ID, signature: "sig" },
    },
    {
      name: "unlinkWallet",
      call: () => unlinkWallet(ID),
      method: "DELETE",
      path: `/api/v1/wallets/${ID}`,
      body: null,
    },
    {
      name: "listSessions",
      call: () => listSessions(),
      method: "GET",
      path: "/api/v1/sessions",
      body: null,
    },
    {
      name: "revokeSession",
      call: () => revokeSession(ID2),
      method: "DELETE",
      path: `/api/v1/sessions/${ID2}`,
      body: null,
    },
  ])("$name sends $method $path same-origin and no-store", async ({ call, method, path, body }) => {
    api = mockApi({});
    await call();
    const request = only();
    expect(request.method).toBe(method);
    expect(new URL(request.url).pathname).toBe(path);
    expect(new URL(request.url).search).toBe("");
    expect(request.credentials).toBe("same-origin");
    expect(request.cache).toBe("no-store");
    const text = await request.text();
    if (body === null) {
      expect(text).toBe("");
    } else {
      expect(JSON.parse(text)).toEqual(body);
      expect(request.headers.get("content-type")).toBe("application/json");
    }
  });

  it("exposes the same ten functions on apiClient", () => {
    expect(Object.keys(apiClient).sort()).toEqual(
      [
        "challenge",
        "linkChallenge",
        "linkVerify",
        "listSessions",
        "listWallets",
        "logout",
        "me",
        "revokeSession",
        "unlinkWallet",
        "verify",
      ].sort(),
    );
    expect(apiClient.me).toBe(me);
  });
});

describe("success mapping", () => {
  it("parses challenge, sign-in, me, wallets and sessions and strips unknown keys", async () => {
    api = mockApi({
      "POST /api/v1/auth/challenge": () => json(200, { ...CHALLENGE, extra: 1 }),
      "POST /api/v1/auth/verify": () =>
        json(200, { user: { id: ID }, wallet: { id: ID, address: "Addr1", network: "devnet" } }),
      "GET /api/v1/me": () =>
        json(200, {
          user: { id: ID, createdAt: ISO },
          session: { id: ID2, network: "devnet", expiresAt: ISO },
          wallets: [WALLET],
        }),
      "GET /api/v1/wallets": () => json(200, { wallets: [{ ...WALLET, extra: true }] }),
      "GET /api/v1/sessions": () => json(200, { sessions: [SESSION] }),
    });
    expect(await challenge({ address: "Addr1", network: "devnet" })).toEqual({
      ok: true,
      data: CHALLENGE,
    });
    expect((await verify({ challengeId: ID, signature: "s" })).ok).toBe(true);
    const meResult = await me();
    expect(meResult.ok && meResult.data.wallets).toEqual([WALLET]);
    expect(await listWallets()).toEqual({ ok: true, data: [WALLET] });
    expect(await listSessions()).toEqual({ ok: true, data: [SESSION] });
  });

  it("maps linkVerify 201 to created: true and 200 to created: false", async () => {
    let status = 201;
    api = mockApi({ "POST /api/v1/wallets/link/verify": () => json(status, { wallet: WALLET }) });
    expect(await linkVerify({ challengeId: ID, signature: "s" })).toEqual({
      ok: true,
      data: { wallet: WALLET, created: true },
    });
    status = 200;
    expect(await linkVerify({ challengeId: ID, signature: "s" })).toEqual({
      ok: true,
      data: { wallet: WALLET, created: false },
    });
  });

  it("returns data null for a 204", async () => {
    api = mockApi({
      "POST /api/v1/auth/logout": () => noContent(),
      "DELETE /api/v1/wallets/:id": () => noContent(),
      "DELETE /api/v1/sessions/:id": () => noContent(),
    });
    expect(await logout()).toEqual({ ok: true, data: null });
    expect(await unlinkWallet(ID)).toEqual({ ok: true, data: null });
    expect(await revokeSession(ID)).toEqual({ ok: true, data: null });
  });

  it.each(SOLANA_NETWORK_IDS)("accepts every server network id (%s)", async (network) => {
    api = mockApi({
      "GET /api/v1/wallets": () => json(200, { wallets: [{ ...WALLET, network }] }),
    });
    expect((await listWallets()).ok).toBe(true);
  });
});

describe("failure mapping", () => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["AUTH_FAILED", 401],
    ["VALIDATION_FAILED", 400],
    ["NETWORK_UNSUPPORTED", 400],
    ["NOT_FOUND", 404],
    ["LAST_WALLET", 409],
    ["WALLET_ALREADY_LINKED", 409],
    ["ORIGIN_REJECTED", 403],
    ["RATE_LIMITED", 429],
    ["DEPENDENCY_UNAVAILABLE", 503],
    ["INTERNAL", 500],
  ])("maps %s (%i) to { ok: false, code, message }", async (code, status) => {
    api = mockApi({ "GET /api/v1/me": () => json(status, { code, message: "safe message" }) });
    const result = await me();
    expect(result).toMatchObject({ ok: false, code, message: "safe message" });
    if (status !== 429) expect(result).not.toHaveProperty("retryAfter");
  });

  it.each([
    ["42", 42],
    [null, 60],
    ["abc", 60],
    ["0", 1],
    ["99999", 3600],
  ])("reads Retry-After %s on a 429 as %i seconds", async (header, seconds) => {
    const headers: Record<string, string> = header === null ? {} : { "Retry-After": header };
    api = mockApi({
      "POST /api/v1/auth/challenge": () =>
        json(429, { code: "RATE_LIMITED", message: "Too many requests" }, headers),
    });
    expect(await challenge({ address: "Addr1", network: "devnet" })).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many requests",
      retryAfter: seconds,
    });
  });

  it("maps a fetch rejection to NETWORK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    api = { requests: [], restore: () => vi.unstubAllGlobals() };
    expect(await me()).toMatchObject({ ok: false, code: "NETWORK" });
  });

  it("maps an aborted request to ABORTED", async () => {
    api = mockApi({ "GET /api/v1/me": () => new Promise<Response>(() => undefined) });
    const controller = new AbortController();
    const pending = me({ signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, code: "ABORTED" });
  });

  it.each<[string, () => Response]>([
    ["a non-JSON 200 body", () => new Response("<html>", { status: 200 })],
    ["a schema mismatch", () => json(200, { user: { id: "not-an-id" } })],
    ["a non-JSON error body", () => new Response("oops", { status: 500 })],
    ["an error body without code", () => json(400, { message: "x" })],
  ])("maps %s to UNEXPECTED_RESPONSE", async (_label, respond) => {
    api = mockApi({ "GET /api/v1/me": respond });
    expect(await me()).toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it("maps a 200 on a 204 endpoint to UNEXPECTED_RESPONSE", async () => {
    api = mockApi({ "POST /api/v1/auth/logout": () => json(200, {}) });
    expect(await logout()).toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it("never throws when response.json() throws", async () => {
    api = mockApi({
      "GET /api/v1/me": () => {
        const response = new Response("{}", { status: 200 });
        Object.defineProperty(response, "json", { value: () => Promise.reject(new Error("x")) });
        return response;
      },
    });
    await expect(me()).resolves.toMatchObject({ ok: false, code: "UNEXPECTED_RESPONSE" });
  });

  it.each([
    ["unlinkWallet", (id: string) => unlinkWallet(id)],
    ["revokeSession", (id: string) => revokeSession(id)],
  ])("%s rejects a non-ObjectId id without calling fetch", async (_name, call) => {
    api = mockApi({});
    for (const id of ["../me", "ABC", "a".repeat(23), `${"a".repeat(24)}/x`]) {
      expect(await call(id)).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    }
    expect(api.requests).toHaveLength(0);
  });
});

describe("onUnauthenticated", () => {
  it("calls the handler once for UNAUTHENTICATED but not for AUTH_FAILED", async () => {
    const handler = vi.fn();
    unregister = onUnauthenticated(handler);
    let code = "UNAUTHENTICATED";
    api = mockApi({ "GET /api/v1/me": () => json(401, { code, message: "m" }) });
    await me();
    expect(handler).toHaveBeenCalledTimes(1);
    code = "AUTH_FAILED";
    await me();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unregister clears the slot only if it still holds the same handler", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = onUnauthenticated(first);
    unregister = onUnauthenticated(second);
    unregisterFirst();
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    await me();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unregister();
    unregister = null;
    await me();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("swallows a throwing handler", async () => {
    unregister = onUnauthenticated(() => {
      throw new Error("handler broke");
    });
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    await expect(me()).resolves.toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/api-client.test.ts`
Expected: FAIL: the named imports (`apiClient`, `challenge`, …) are not exported from `@/modules/wallet-connect` (every case fails with `… is not a function`).

- [ ] **Step 4: Implement**

Create `src/modules/wallet-connect/internal/schemas.ts`:

```ts
import * as z from "zod/mini";
import type { SolanaNetwork } from "@/modules/validation";

/**
 * Client copies of the 02a response shapes (route handlers, auth/internal/types.ts,
 * wallet/internal/repository.ts). Non-strict objects strip unknown keys, so a server that adds a
 * field does not break the client.
 */
const objectId = z.string().check(z.regex(/^[0-9a-f]{24}$/));
/** ISO-8601 from toISOString(). */
const isoDate = z.string().check(z.minLength(1));
/** Duplicates SOLANA_NETWORK_IDS so the client never loads validation's runtime (full zod). */
const networkSchema = z.enum(["devnet", "mainnet-beta"]);

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
/** Compile-time guard: fails typecheck if the enum drifts from SolanaNetwork. */
export const NETWORK_SCHEMA_MATCHES: AssertEqual<
  z.infer<typeof networkSchema>,
  SolanaNetwork
> = true;

export const errorBodySchema = z.object({ code: z.string(), message: z.string() });

/** POST /auth/challenge and POST /wallets/link/challenge → 200 */
export const challengeSchema = z.object({
  challengeId: objectId,
  message: z.string(),
  expiresAt: isoDate,
});

/** POST /auth/verify → 200 { user, wallet } (+ Set-Cookie) */
export const signInSchema = z.object({
  user: z.object({ id: objectId }),
  wallet: z.object({ id: objectId, address: z.string(), network: networkSchema }),
});

/** WalletView */
export const walletItemSchema = z.object({
  id: objectId,
  address: z.string(),
  network: networkSchema,
  provider: z.nullable(z.string()),
  status: z.enum(["active", "disconnected"]),
  linkedAt: isoDate,
});

/** POST /wallets/link/verify → 201 (created) or 200 (already linked) { wallet } */
export const linkSchema = z.object({ wallet: walletItemSchema });

/** GET /me → 200 */
export const meSchema = z.object({
  user: z.object({ id: objectId, createdAt: isoDate }),
  session: z.object({ id: objectId, network: networkSchema, expiresAt: isoDate }),
  wallets: z.array(walletItemSchema),
});

/** GET /wallets → 200 */
export const walletsSchema = z.object({ wallets: z.array(walletItemSchema) });

/** SessionView */
export const sessionItemSchema = z.object({
  id: objectId,
  current: z.boolean(),
  createdAt: isoDate,
  lastSeenAt: isoDate,
  expiresAt: isoDate,
  network: networkSchema,
  userAgent: z.nullable(z.string()),
});

/** GET /sessions → 200 */
export const sessionsSchema = z.object({ sessions: z.array(sessionItemSchema) });

export type ChallengeData = z.infer<typeof challengeSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type WalletItem = z.infer<typeof walletItemSchema>;
/** created is true when the server answered 201. */
export interface LinkData {
  readonly wallet: WalletItem;
  readonly created: boolean;
}
export type MeData = z.infer<typeof meSchema>;
export type SessionItem = z.infer<typeof sessionItemSchema>;
```

Create `src/modules/wallet-connect/internal/api-client.ts`:

```ts
import type * as z from "zod/mini";
import type { SolanaNetwork } from "@/modules/validation";
import {
  challengeSchema,
  errorBodySchema,
  linkSchema,
  meSchema,
  sessionsSchema,
  signInSchema,
  walletsSchema,
  type ChallengeData,
  type LinkData,
  type MeData,
  type SessionItem,
  type SignInData,
  type WalletItem,
} from "./schemas";

export interface ApiFailure {
  readonly ok: false;
  /**
   * Server code (UNAUTHENTICATED, AUTH_FAILED, VALIDATION_FAILED, NETWORK_UNSUPPORTED, NOT_FOUND,
   * LAST_WALLET, WALLET_ALREADY_LINKED, ORIGIN_REJECTED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE,
   * INTERNAL, …) or a client code: NETWORK, UNEXPECTED_RESPONSE, ABORTED.
   */
  readonly code: string;
  /** Server safeMessage or a fixed client string; never shown to users. */
  readonly message: string;
  /** Seconds; 429 only. */
  readonly retryAfter?: number;
}

export type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure;

export interface RequestOptions {
  readonly signal?: AbortSignal;
}

interface ChallengeInput {
  readonly address: string;
  readonly network: SolanaNetwork;
}

interface VerifyInput {
  readonly challengeId: string;
  readonly signature: string;
  /** Omitted from the JSON body when undefined. */
  readonly provider?: string;
}

type Expect = 200 | 204 | "200|201";

interface Spec<T> {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly expect: Expect;
  /** Parses a 2xx JSON body; null means a schema mismatch. Unused for 204. */
  readonly parse: (json: unknown, status: number) => T | null;
  readonly signal?: AbortSignal;
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
const RETRY_AFTER_FALLBACK_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;

let unauthenticatedHandler: (() => void) | null = null;

/** One global slot. Returns an unregister that clears the slot only if it still holds `handler`. */
export function onUnauthenticated(handler: () => void): () => void {
  unauthenticatedHandler = handler;
  return () => {
    if (unauthenticatedHandler === handler) unauthenticatedHandler = null;
  };
}

function failure(code: string, message: string, retryAfter?: number): ApiFailure {
  return retryAfter === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, retryAfter };
}

const UNEXPECTED = (): ApiFailure => failure("UNEXPECTED_RESPONSE", "unexpected response");

/** Retry-After in whole seconds, clamped to 1..3600; 60 when missing or not a number. */
function retryAfterSeconds(header: string | null): number {
  const seconds = header === null ? Number.NaN : Number.parseInt(header, 10);
  if (!Number.isFinite(seconds)) return RETRY_AFTER_FALLBACK_SECONDS;
  return Math.min(RETRY_AFTER_MAX_SECONDS, Math.max(1, seconds));
}

function statusMatches(expect: Expect, status: number): boolean {
  if (expect === "200|201") return status === 200 || status === 201;
  return status === expect;
}

function parser<S extends z.ZodMiniType>(schema: S): (json: unknown) => z.infer<S> | null {
  return (json) => {
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  };
}

async function sendOnce<T>(spec: Spec<T>): Promise<ApiResult<T>> {
  const aborted = (): boolean => spec.signal?.aborted === true;
  let response: Response;
  try {
    const init: RequestInit = {
      method: spec.method,
      credentials: "same-origin",
      cache: "no-store",
      signal: spec.signal,
    };
    if (spec.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(spec.body);
    }
    response = await fetch(spec.path, init);
  } catch {
    return aborted() ? failure("ABORTED", "aborted") : failure("NETWORK", "network error");
  }
  try {
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(await response.json());
      if (!parsed.success) return UNEXPECTED();
      const { code, message } = parsed.data;
      return response.status === 429
        ? failure(code, message, retryAfterSeconds(response.headers.get("Retry-After")))
        : failure(code, message);
    }
    if (!statusMatches(spec.expect, response.status)) return UNEXPECTED();
    if (spec.expect === 204) return { ok: true, data: null as T };
    const data = spec.parse(await response.json(), response.status);
    return data === null ? UNEXPECTED() : { ok: true, data };
  } catch {
    return aborted() ? failure("ABORTED", "aborted") : UNEXPECTED();
  }
}

/** Never throws. An UNAUTHENTICATED result calls the registered handler once before resolving. */
async function send<T>(spec: Spec<T>): Promise<ApiResult<T>> {
  const result = await sendOnce(spec);
  if (!result.ok && result.code === "UNAUTHENTICATED") {
    try {
      unauthenticatedHandler?.();
    } catch {
      // A failing handler must not turn into a thrown API call.
    }
  }
  return result;
}

const parseChallenge = parser(challengeSchema);
const parseSignIn = parser(signInSchema);
const parseLink = parser(linkSchema);
const parseMe = parser(meSchema);
const parseWallets = parser(walletsSchema);
const parseSessions = parser(sessionsSchema);
const noBody = (): null => null;

export function challenge(
  input: ChallengeInput,
  options: RequestOptions = {},
): Promise<ApiResult<ChallengeData>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/challenge",
    body: { address: input.address, network: input.network },
    expect: 200,
    parse: parseChallenge,
    signal: options.signal,
  });
}

export function verify(
  input: VerifyInput,
  options: RequestOptions = {},
): Promise<ApiResult<SignInData>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/verify",
    body: { challengeId: input.challengeId, signature: input.signature, provider: input.provider },
    expect: 200,
    parse: parseSignIn,
    signal: options.signal,
  });
}

export function logout(options: RequestOptions = {}): Promise<ApiResult<null>> {
  return send({
    method: "POST",
    path: "/api/v1/auth/logout",
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export function me(options: RequestOptions = {}): Promise<ApiResult<MeData>> {
  return send({
    method: "GET",
    path: "/api/v1/me",
    expect: 200,
    parse: parseMe,
    signal: options.signal,
  });
}

export function listWallets(
  options: RequestOptions = {},
): Promise<ApiResult<readonly WalletItem[]>> {
  return send({
    method: "GET",
    path: "/api/v1/wallets",
    expect: 200,
    parse: (json) => parseWallets(json)?.wallets ?? null,
    signal: options.signal,
  });
}

export function linkChallenge(
  input: ChallengeInput,
  options: RequestOptions = {},
): Promise<ApiResult<ChallengeData>> {
  return send({
    method: "POST",
    path: "/api/v1/wallets/link/challenge",
    body: { address: input.address, network: input.network },
    expect: 200,
    parse: parseChallenge,
    signal: options.signal,
  });
}

export function linkVerify(
  input: VerifyInput,
  options: RequestOptions = {},
): Promise<ApiResult<LinkData>> {
  return send({
    method: "POST",
    path: "/api/v1/wallets/link/verify",
    body: { challengeId: input.challengeId, signature: input.signature, provider: input.provider },
    expect: "200|201",
    parse: (json, status) => {
      const body = parseLink(json);
      return body === null ? null : { wallet: body.wallet, created: status === 201 };
    },
    signal: options.signal,
  });
}

export async function unlinkWallet(
  walletId: string,
  options: RequestOptions = {},
): Promise<ApiResult<null>> {
  if (!OBJECT_ID.test(walletId)) return failure("VALIDATION_FAILED", "invalid id");
  return send({
    method: "DELETE",
    path: `/api/v1/wallets/${encodeURIComponent(walletId)}`,
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export function listSessions(
  options: RequestOptions = {},
): Promise<ApiResult<readonly SessionItem[]>> {
  return send({
    method: "GET",
    path: "/api/v1/sessions",
    expect: 200,
    parse: (json) => parseSessions(json)?.sessions ?? null,
    signal: options.signal,
  });
}

export async function revokeSession(
  sessionId: string,
  options: RequestOptions = {},
): Promise<ApiResult<null>> {
  if (!OBJECT_ID.test(sessionId)) return failure("VALIDATION_FAILED", "invalid id");
  return send({
    method: "DELETE",
    path: `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    expect: 204,
    parse: noBody,
    signal: options.signal,
  });
}

export interface ApiClient {
  readonly challenge: typeof challenge;
  readonly verify: typeof verify;
  readonly logout: typeof logout;
  readonly me: typeof me;
  readonly listWallets: typeof listWallets;
  readonly linkChallenge: typeof linkChallenge;
  readonly linkVerify: typeof linkVerify;
  readonly unlinkWallet: typeof unlinkWallet;
  readonly listSessions: typeof listSessions;
  readonly revokeSession: typeof revokeSession;
}

export const apiClient: ApiClient = {
  challenge,
  verify,
  logout,
  me,
  listWallets,
  linkChallenge,
  linkVerify,
  unlinkWallet,
  listSessions,
  revokeSession,
};
```

Replace the whole of `src/modules/wallet-connect/index.ts` with:

```ts
export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption,
  FlowEvent,
  FlowFailureCode,
  FlowMode,
  FlowState,
  FlowStatus,
  SignPreview,
} from "./internal/flow";
export { classifyWalletError } from "./internal/errors";
export type { WalletErrorKind } from "./internal/errors";
export { parseChallengePreview } from "./internal/challenge-preview";
export { toProviderId } from "./internal/provider-id";
export { encodeBase58 } from "./internal/base58";
export {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
} from "./internal/api-client";
export type { ApiClient, ApiFailure, ApiResult, RequestOptions } from "./internal/api-client";
export type {
  ChallengeData,
  LinkData,
  MeData,
  SessionItem,
  SignInData,
  WalletItem,
} from "./internal/schemas";
```

- [ ] **Step 5: Run to verify it passes**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/api-client.test.ts`
Expected: PASS, `Tests  46 passed`.
What would make it fail: omitting `credentials: "same-origin"` or `cache: "no-store"`, putting ids or addresses in a query string (`search` must be empty), calling the unauthenticated handler for `AUTH_FAILED`, or letting `response.json()` throw out of the client.

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  1019 passed (1019)`. Typecheck also proves the network enum equals `SolanaNetwork` (the `_networkSchemaMatches` guard in `schemas.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/modules/wallet-connect/internal/schemas.ts src/modules/wallet-connect/internal/api-client.ts src/modules/wallet-connect/index.ts tests/helpers/fake-api.ts tests/unit/wallet-connect/api-client.test.ts
git commit -m "feat(wallet-connect): add typed /api/v1 client that never throws" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 9: Wallet Standard discovery: feature accessors, registry and `useWallets`

Architecture §3.1.1–§3.1.3 and §3.7 (fake wallet). The first `ui` project test lands here.

**Files:**
- Create: `src/modules/wallet-connect/internal/features.ts`, `src/modules/wallet-connect/internal/registry.ts`, `src/modules/wallet-connect/internal/use-wallets.ts`, `tests/helpers/fake-wallet.ts`, `tests/unit/wallet-connect/registry.test.ts`, `tests/ui/wallet-connect/use-wallets.test.tsx`
- Modify: `src/modules/wallet-connect/index.ts`
- Test: the two new test files

**Interfaces:**
- Consumes: `getWallets()` from `@wallet-standard/app` (`get()`, `on("register" | "unregister", listener) → off`, `register(...wallets) → unregister`); types `Wallet`, `WalletAccount`, `WalletIcon`, `IdentifierString` from `@wallet-standard/base`; `StandardConnect`, `StandardEvents`, their feature types and `StandardEventsChangeProperties` from `@wallet-standard/features`; `SolanaSignMessage` and its types from `@solana/wallet-standard-features`; `createTestWallet()` (`tests/helpers/ed25519.ts`: `address`, `publicKey`, `sign(message: string): string`, `signBytes(bytes: Uint8Array): Uint8Array`).
- Produces:
  - Internal (`features.ts`, not exported from the index): `getConnect(wallet)`, `getEvents(wallet)`, `getSignMessage(wallet)` (the feature object when its method is a function, else `null`; never throw) and `hasSolanaChain(wallet): boolean`.
  - From `@/modules/wallet-connect`: `interface WalletEntry { id: string; name: string; icon: WalletIcon; canSignIn: boolean; wallet: Wallet }`; `listSolanaWallets(): readonly WalletEntry[]` (cached snapshot; listed = a `solana:` chain or any `solana:` feature; `canSignIn` = connect + signMessage + a `solana:` chain; sign-in-capable first, then registration order; ids `w1`, `w2`, … stable per wallet object); `subscribeWallets(listener: () => void): () => void`; `refreshWallets(): void`; `useWallets(): readonly WalletEntry[]` (server snapshot `[]`). `getWallets()` runs on first use, never at import.
  - `tests/helpers/fake-wallet.ts`: `createFakeWallet(options?: FakeWalletOptions): FakeWallet` with `FakeWalletMode = "approve" | "reject" | "disconnect" | "switch-account" | "hang" | "no-signMessage"`, `RejectionShape = "standard-4001" | "phantom" | "solflare" | "wrapped"`, options `name` (default "Fake Wallet"), `mode`, `accountCount` (default 1), `chains` (default `["solana:devnet", "solana:mainnet"]`), `rejectOn: "connect" | "sign"` (default "sign"), `rejectionShape`; `FakeWallet { wallet; keys: TestWallet[]; setMode(mode); calls: { connect; signMessage }; emitChange(properties); register(): () => void }`. Signatures are real Ed25519 (`keys[i].signBytes`). The Wallet Standard registry is a module singleton: always call the returned unregister in `afterEach`.

- [ ] **Step 1: Write the fake wallet helper**

Create `tests/helpers/fake-wallet.ts`:

```ts
import { SolanaSignMessage, type SolanaSignMessageInput } from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type { IdentifierString, Wallet, WalletAccount, WalletIcon } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardEvents,
  type StandardEventsChangeProperties,
} from "@wallet-standard/features";
import { createTestWallet, type TestWallet } from "./ed25519";

export type FakeWalletMode =
  "approve" | "reject" | "disconnect" | "switch-account" | "hang" | "no-signMessage";
export type RejectionShape = "standard-4001" | "phantom" | "solflare" | "wrapped";

export interface FakeWalletOptions {
  /** Default "Fake Wallet". */
  readonly name?: string;
  /** Default "approve". */
  readonly mode?: FakeWalletMode;
  /** Default 1 (2 or more exercises the account picker). */
  readonly accountCount?: number;
  /** Default ["solana:devnet", "solana:mainnet"]. */
  readonly chains?: readonly IdentifierString[];
  /** Which step reject/disconnect apply to. Default "sign". */
  readonly rejectOn?: "connect" | "sign";
  /** Default "standard-4001". */
  readonly rejectionShape?: RejectionShape;
}

export interface FakeWallet {
  readonly wallet: Wallet;
  /** keys[i].address is account i. */
  readonly keys: readonly TestWallet[];
  setMode(mode: FakeWalletMode): void;
  readonly calls: { readonly connect: number; readonly signMessage: number };
  /** Calls every standard:events "change" listener. */
  emitChange(properties: StandardEventsChangeProperties): void;
  /** getWallets().register(wallet); returns unregister (call it in afterEach). */
  register(): () => void;
}

const ICON: WalletIcon = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#A78BFA"/></svg>',
)}`;

function rejection(shape: RejectionShape): unknown {
  switch (shape) {
    case "standard-4001":
      return Object.assign(new Error("User rejected the request."), { code: 4001 });
    case "phantom":
      return { code: 4001, message: "User rejected the request." };
    case "solflare": {
      const error = new Error("User rejected the request");
      error.name = "WalletSignMessageError";
      return error;
    }
    case "wrapped":
      return { name: "WalletSignMessageError", error: { code: 4001 } };
  }
}

function disconnectedError(): Error {
  const error = new Error("Wallet disconnected");
  error.name = "WalletDisconnectedError";
  return error;
}

function toAccount(key: TestWallet, chains: readonly IdentifierString[]): WalletAccount {
  return Object.freeze({
    address: key.address,
    publicKey: key.publicKey,
    chains,
    features: [SolanaSignMessage] as const,
  });
}

/**
 * An in-memory Wallet Standard wallet with scripted modes. It signs with real Ed25519 keys
 * (tests/helpers/ed25519.ts), so its signatures verify like a real wallet's.
 */
export function createFakeWallet(options: FakeWalletOptions = {}): FakeWallet {
  const chains = options.chains ?? ["solana:devnet", "solana:mainnet"];
  const rejectOn = options.rejectOn ?? "sign";
  const shape = options.rejectionShape ?? "standard-4001";
  const keys = Array.from({ length: options.accountCount ?? 1 }, () => createTestWallet());
  let accounts: readonly WalletAccount[] = keys.map((key) => toAccount(key, chains));
  let mode: FakeWalletMode = options.mode ?? "approve";
  const calls = { connect: 0, signMessage: 0 };
  const listeners = new Set<(properties: StandardEventsChangeProperties) => void>();

  const emitChange = (properties: StandardEventsChangeProperties): void => {
    for (const listener of [...listeners]) listener(properties);
  };

  const failStep = async (step: "connect" | "sign"): Promise<void> => {
    if (rejectOn !== step) return;
    if (mode === "reject") throw rejection(shape);
    if (mode === "disconnect") {
      emitChange({ accounts: [] });
      throw disconnectedError();
    }
  };

  const connectFeature = {
    version: "1.0.0" as const,
    connect: async () => {
      calls.connect += 1;
      await failStep("connect");
      return { accounts };
    },
  };
  const eventsFeature = {
    version: "1.0.0" as const,
    on: (_event: "change", listener: (properties: StandardEventsChangeProperties) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const signMessageFeature = {
    version: "1.1.0" as const,
    signMessage: async (...inputs: readonly SolanaSignMessageInput[]) => {
      calls.signMessage += 1;
      await failStep("sign");
      if (mode === "hang") return new Promise<never>(() => undefined);
      if (mode === "switch-account") {
        accounts = [toAccount(createTestWallet(), chains)];
        emitChange({ accounts });
        return new Promise<never>(() => undefined);
      }
      return inputs.map((input) => {
        const key = keys.find((k) => k.address === input.account.address);
        if (key === undefined) throw new Error("unknown account");
        return {
          signedMessage: input.message,
          signature: key.signBytes(input.message),
          signatureType: "ed25519" as const,
        };
      });
    },
  };

  const wallet: Wallet = {
    version: "1.0.0",
    name: options.name ?? "Fake Wallet",
    icon: ICON,
    chains,
    get accounts() {
      return accounts;
    },
    get features() {
      const base = { [StandardConnect]: connectFeature, [StandardEvents]: eventsFeature };
      return mode === "no-signMessage"
        ? base
        : { ...base, [SolanaSignMessage]: signMessageFeature };
    },
  };

  return {
    wallet,
    keys,
    setMode: (next) => {
      mode = next;
    },
    calls,
    emitChange,
    register: () => getWallets().register(wallet),
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/wallet-connect/registry.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { listSolanaWallets, refreshWallets, subscribeWallets } from "@/modules/wallet-connect";
import { createFakeWallet } from "../../helpers/fake-wallet";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function registered(...args: Parameters<typeof createFakeWallet>) {
  const fake = createFakeWallet(...args);
  cleanups.push(fake.register());
  return fake;
}

function names(): string[] {
  return listSolanaWallets().map((entry) => entry.name);
}

describe("listSolanaWallets", () => {
  it("lists a Solana wallet with connect and signMessage as able to sign in", () => {
    const fake = registered({ name: "Approve" });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({
        name: "Approve",
        icon: fake.wallet.icon,
        canSignIn: true,
        wallet: fake.wallet,
      }),
    ]);
  });

  it("lists a wallet without solana:signMessage with canSignIn false", () => {
    registered({ name: "NoSign", mode: "no-signMessage" });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({ name: "NoSign", canSignIn: false }),
    ]);
  });

  it("lists a wallet with a solana: feature but no solana chain with canSignIn false", () => {
    registered({ name: "EvmChains", chains: ["eip155:1"] });
    expect(listSolanaWallets()).toEqual([
      expect.objectContaining({ name: "EvmChains", canSignIn: false }),
    ]);
  });

  it("does not list a wallet with neither a solana chain nor a solana feature", () => {
    registered({ name: "EvmOnly", chains: ["eip155:1"], mode: "no-signMessage" });
    expect(listSolanaWallets()).toEqual([]);
  });

  it("puts wallets that can sign in first, then registration order", () => {
    registered({ name: "B-disabled", mode: "no-signMessage" });
    registered({ name: "C-ok" });
    registered({ name: "D-disabled", mode: "no-signMessage" });
    registered({ name: "E-ok" });
    expect(names()).toEqual(["C-ok", "E-ok", "B-disabled", "D-disabled"]);
  });

  it("keeps the same array identity until an event", () => {
    registered({ name: "One" });
    const first = listSolanaWallets();
    expect(listSolanaWallets()).toBe(first);
  });

  it("gives each wallet object a stable id", () => {
    const fake = registered({ name: "Stable" });
    const id = listSolanaWallets()[0]?.id;
    expect(id).toMatch(/^w\d+$/);
    registered({ name: "Other" });
    expect(listSolanaWallets().find((entry) => entry.wallet === fake.wallet)?.id).toBe(id);
  });
});

describe("subscribeWallets and refreshWallets", () => {
  it("notifies on a late register and the snapshot changes identity", () => {
    const before = listSolanaWallets();
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    registered({ name: "Late" });
    expect(listener).toHaveBeenCalledTimes(1);
    const after = listSolanaWallets();
    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.name)).toContain("Late");
  });

  it("notifies on unregister and removes the wallet", () => {
    const fake = createFakeWallet({ name: "Leaving" });
    const unregister = fake.register();
    expect(names()).toContain("Leaving");
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    unregister();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(names()).not.toContain("Leaving");
  });

  it("refreshWallets notifies and rebuilds the snapshot", () => {
    const before = listSolanaWallets();
    const listener = vi.fn();
    cleanups.push(subscribeWallets(listener));
    refreshWallets();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listSolanaWallets()).not.toBe(before);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWallets(listener);
    unsubscribe();
    registered({ name: "Unheard" });
    refreshWallets();
    expect(listener).not.toHaveBeenCalled();
  });
});
```

Create `tests/ui/wallet-connect/use-wallets.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useWallets } from "@/modules/wallet-connect";
import { createFakeWallet } from "../../helpers/fake-wallet";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function WalletNames() {
  const wallets = useWallets();
  return <p data-testid="names">{wallets.map((entry) => entry.name).join(",") || "none"}</p>;
}

describe("useWallets", () => {
  it("renders the server snapshot [] on the server", () => {
    cleanups.push(createFakeWallet({ name: "Present" }).register());
    expect(renderToString(<WalletNames />)).toContain("none");
  });

  it("re-renders on a late register and on unregister", () => {
    render(<WalletNames />);
    expect(screen.getByTestId("names").textContent).toBe("none");
    let unregister: () => void = () => undefined;
    act(() => {
      unregister = createFakeWallet({ name: "Late" }).register();
    });
    expect(screen.getByTestId("names").textContent).toBe("Late");
    act(() => unregister());
    expect(screen.getByTestId("names").textContent).toBe("none");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/registry.test.ts && bunx vitest run --project ui tests/ui/wallet-connect/use-wallets.test.tsx`
Expected: FAIL: `listSolanaWallets`/`useWallets` are not exported (`… is not a function`).

- [ ] **Step 4: Implement**

Create `src/modules/wallet-connect/internal/features.ts`:

```ts
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import type { Wallet } from "@wallet-standard/base";
import {
  StandardConnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";

/** { version; connect(input?: { silent?: boolean }) → Promise<{ accounts }> } */
export type ConnectFeature = StandardConnectFeature[typeof StandardConnect];
/** { version; on("change", listener) → off } */
export type EventsFeature = StandardEventsFeature[typeof StandardEvents];
/** { version: "1.0.0" | "1.1.0"; signMessage(...inputs) → Promise<outputs> } */
export type SignMessageFeature = SolanaSignMessageFeature[typeof SolanaSignMessage];

/** The feature object when present with `method` as a function; otherwise null. Never throws. */
function feature<T>(wallet: Wallet, name: string, method: string): T | null {
  try {
    const value: unknown = (wallet.features as Readonly<Record<string, unknown>>)[name];
    if (typeof value !== "object" || value === null) return null;
    return typeof (value as Record<string, unknown>)[method] === "function" ? (value as T) : null;
  } catch {
    return null;
  }
}

export function getConnect(wallet: Wallet): ConnectFeature | null {
  return feature<ConnectFeature>(wallet, StandardConnect, "connect");
}

export function getEvents(wallet: Wallet): EventsFeature | null {
  return feature<EventsFeature>(wallet, StandardEvents, "on");
}

export function getSignMessage(wallet: Wallet): SignMessageFeature | null {
  return feature<SignMessageFeature>(wallet, SolanaSignMessage, "signMessage");
}

/** True when at least one of the wallet's chains is a solana: chain. */
export function hasSolanaChain(wallet: Wallet): boolean {
  return wallet.chains.some((chain) => chain.startsWith("solana:"));
}
```

Create `src/modules/wallet-connect/internal/registry.ts`:

```ts
import { getWallets, type Wallets } from "@wallet-standard/app";
import type { Wallet, WalletIcon } from "@wallet-standard/base";
import { getConnect, getSignMessage, hasSolanaChain } from "./features";

export interface WalletEntry {
  /** Stable per Wallet object for the page lifetime: "w1", "w2", … */
  readonly id: string;
  readonly name: string;
  /** A data: URI (allowed by the CSP's img-src 'self' data:). */
  readonly icon: WalletIcon;
  readonly canSignIn: boolean;
  readonly wallet: Wallet;
}

let registry: Wallets | null = null;
let snapshot: readonly WalletEntry[] | null = null;
const listeners = new Set<() => void>();
const ids = new WeakMap<Wallet, string>();
let nextId = 1;

function changed(): void {
  snapshot = null;
  for (const listener of [...listeners]) listener();
}

/** getWallets() runs on first use, never at import time. One permanent subscription. */
function ensureRegistry(): Wallets {
  if (registry === null) {
    registry = getWallets();
    registry.on("register", changed);
    registry.on("unregister", changed);
  }
  return registry;
}

function idFor(wallet: Wallet): string {
  let id = ids.get(wallet);
  if (id === undefined) {
    id = `w${nextId}`;
    nextId += 1;
    ids.set(wallet, id);
  }
  return id;
}

/** Listed: a solana: chain or any solana: feature. EVM-only Wallet Standard wallets are not. */
function isListed(wallet: Wallet): boolean {
  return (
    hasSolanaChain(wallet) || Object.keys(wallet.features).some((key) => key.startsWith("solana:"))
  );
}

function toEntry(wallet: Wallet): WalletEntry {
  return {
    id: idFor(wallet),
    name: wallet.name,
    icon: wallet.icon,
    canSignIn:
      getConnect(wallet) !== null && getSignMessage(wallet) !== null && hasSolanaChain(wallet),
    wallet,
  };
}

/** Cached snapshot: the same array until a register/unregister event or refreshWallets(). */
export function listSolanaWallets(): readonly WalletEntry[] {
  if (snapshot === null) {
    const entries = ensureRegistry().get().filter(isListed).map(toEntry);
    snapshot = Object.freeze([
      ...entries.filter((entry) => entry.canSignIn),
      ...entries.filter((entry) => !entry.canSignIn),
    ]);
  }
  return snapshot;
}

/** Notified on every register/unregister and on refreshWallets(). Returns the unsubscribe. */
export function subscribeWallets(listener: () => void): () => void {
  ensureRegistry();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rebuilds the snapshot from getWallets().get() and notifies listeners (empty-state Refresh). */
export function refreshWallets(): void {
  ensureRegistry();
  changed();
}
```

Create `src/modules/wallet-connect/internal/use-wallets.ts`:

```ts
import { useSyncExternalStore } from "react";
import { listSolanaWallets, subscribeWallets, type WalletEntry } from "./registry";

const EMPTY: readonly WalletEntry[] = Object.freeze([]);
const serverSnapshot = (): readonly WalletEntry[] => EMPTY;

/**
 * The Solana wallets in this browser. The server snapshot is [], so SSR and the first hydration
 * render show the empty state; late register events re-render.
 */
export function useWallets(): readonly WalletEntry[] {
  return useSyncExternalStore(subscribeWallets, listSolanaWallets, serverSnapshot);
}
```

Replace the whole of `src/modules/wallet-connect/index.ts` with:

```ts
export { listSolanaWallets, refreshWallets, subscribeWallets } from "./internal/registry";
export type { WalletEntry } from "./internal/registry";
export { useWallets } from "./internal/use-wallets";
export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption,
  FlowEvent,
  FlowFailureCode,
  FlowMode,
  FlowState,
  FlowStatus,
  SignPreview,
} from "./internal/flow";
export { classifyWalletError } from "./internal/errors";
export type { WalletErrorKind } from "./internal/errors";
export { parseChallengePreview } from "./internal/challenge-preview";
export { toProviderId } from "./internal/provider-id";
export { encodeBase58 } from "./internal/base58";
export {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
} from "./internal/api-client";
export type { ApiClient, ApiFailure, ApiResult, RequestOptions } from "./internal/api-client";
export type {
  ChallengeData,
  LinkData,
  MeData,
  SessionItem,
  SignInData,
  WalletItem,
} from "./internal/schemas";
```

- [ ] **Step 5: Run to verify they pass**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/registry.test.ts && bunx vitest run --project ui tests/ui/wallet-connect/use-wallets.test.tsx`
Expected: PASS, `11` unit tests and `2` ui tests.
What would make it fail: rebuilding the snapshot on every call (identity test), filtering out wallets without `signMessage` instead of listing them disabled, or a non-empty server snapshot (hydration would mismatch).

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test && bun run test:ui`
Expected: clean; `Tests  1032 passed (1032)` for the whole suite; `bun run test:ui` now passes (`2` tests).

- [ ] **Step 7: Commit**

```bash
git add src/modules/wallet-connect/internal/features.ts src/modules/wallet-connect/internal/registry.ts src/modules/wallet-connect/internal/use-wallets.ts src/modules/wallet-connect/index.ts tests/helpers/fake-wallet.ts tests/unit/wallet-connect/registry.test.ts tests/ui/wallet-connect/use-wallets.test.tsx
git commit -m "feat(wallet-connect): discover Solana wallets through Wallet Standard" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 10: The flow driver `runFlow` and the `useConnectFlow` hook

Architecture §3.1.5, §3.1.6 and §7.1. One linear async driver turns wallet and API calls into reducer events; the hook owns attempt ids, aborting, and the account picker promise.

**Files:**
- Create: `src/modules/wallet-connect/internal/run-flow.ts`, `src/modules/wallet-connect/internal/use-connect-flow.ts`, `tests/unit/wallet-connect/run-flow.test.ts`, `tests/ui/wallet-connect/use-connect-flow.test.tsx`
- Modify: `src/modules/wallet-connect/index.ts`
- Test: the two new test files

**Interfaces:**
- Consumes: `reduce`, `initialFlowState`, `FlowEvent`, `FlowMode`, `FlowState`, `AccountOption` (Task 7); `classifyWalletError`, `parseChallengePreview`, `toProviderId`, `encodeBase58` (Task 7); `ApiClient`, `ApiFailure`, `apiClient` (Task 8); `getConnect`, `getEvents`, `getSignMessage`, `WalletEntry` (Task 9); helpers `createFakeWallet`, `challengeFor`.
- Produces (from `@/modules/wallet-connect`):
  - `interface FlowApi { challenge; verify; linkChallenge; linkVerify }` (the `ApiClient` signatures).
  - `interface RunFlowOptions { mode; entry: WalletEntry; network; attemptId; signal: AbortSignal; dispatch(event); api: FlowApi; expectedDomain: string; preferredAddress?: string; selectAccount(accounts, signal): Promise<string>; now?(): number }` and `runFlow(options): Promise<void>` — never rejects; dispatches only for its own attempt and never after abort; listens to `standard:events` `change` until the signature exists (no accounts → `disconnected`; the selected account gone → `account-changed`; both abort); refuses to sign a challenge whose domain, address or network differ (`UNEXPECTED_RESPONSE`); a signature that is not 64 bytes → `wallet-error other`; 429 → `retryAt = now() + retryAfter * 1000`.
  - `interface StartOptions { preferredAddress?: string }`, `interface ConnectFlow { state: FlowState; start(entry, network, options?): void; chooseAccount(address): void; cancel(): void }`, `useConnectFlow({ mode, api? }): ConnectFlow` (`api` defaults to `apiClient`; `expectedDomain` is `window.location.host`, read inside `start`; unmount aborts).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/wallet-connect/run-flow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  runFlow,
  type FlowApi,
  type FlowEvent,
  type RunFlowOptions,
  type WalletEntry,
} from "@/modules/wallet-connect";
import { challengeFor } from "../../helpers/fake-api";
import { createFakeWallet, type FakeWallet } from "../../helpers/fake-wallet";

const DOMAIN = "localhost:3000";
const SIGN_IN = {
  user: { id: "a".repeat(24) },
  wallet: { id: "b".repeat(24), address: "x", network: "devnet" as const },
};
const LINKED = {
  wallet: {
    id: "c".repeat(24),
    address: "x",
    network: "devnet" as const,
    provider: null,
    status: "active" as const,
    linkedAt: "2026-11-13T10:00:00.000Z",
  },
  created: true,
};

function entryFor(fake: FakeWallet): WalletEntry {
  return {
    id: "w1",
    name: fake.wallet.name,
    icon: fake.wallet.icon,
    canSignIn: true,
    wallet: fake.wallet,
  };
}

function fakeApi() {
  const challenges: { challengeId: string; message: string }[] = [];
  const issue = async ({
    address,
    network,
  }: {
    address: string;
    network: "devnet" | "mainnet-beta";
  }) => {
    const data = challengeFor({ address, network });
    challenges.push(data);
    return { ok: true as const, data };
  };
  const api = {
    challenge: vi.fn<FlowApi["challenge"]>(issue),
    linkChallenge: vi.fn<FlowApi["linkChallenge"]>(issue),
    verify: vi.fn<FlowApi["verify"]>(async () => ({ ok: true as const, data: SIGN_IN })),
    linkVerify: vi.fn<FlowApi["linkVerify"]>(async () => ({ ok: true as const, data: LINKED })),
  };
  return { api, challenges };
}

function start(fake: FakeWallet, overrides: Partial<RunFlowOptions> = {}) {
  const events: FlowEvent[] = [];
  const controller = new AbortController();
  const { api, challenges } = fakeApi();
  const selectAccount = vi.fn<RunFlowOptions["selectAccount"]>(
    async (accounts) => accounts[1]?.address ?? "",
  );
  const done = runFlow({
    mode: "sign-in",
    entry: entryFor(fake),
    network: "devnet",
    attemptId: 7,
    signal: controller.signal,
    dispatch: (event) => events.push(event),
    api,
    expectedDomain: DOMAIN,
    selectAccount,
    ...overrides,
  });
  return { events, controller, api, challenges, selectAccount, done };
}

const types = (events: readonly FlowEvent[]) => events.map((event) => event.type);

describe("runFlow: happy paths", () => {
  it("signs in: connect, challenge, sign, verify with a real signature", async () => {
    const fake = createFakeWallet({ name: "Fake Wallet" });
    const { events, api, challenges, done } = start(fake);
    await done;
    expect(types(events)).toEqual([
      "start",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
    expect(events.every((event) => event.type === "reset" || event.attemptId === 7)).toBe(true);
    const address = fake.keys[0]?.address ?? "";
    expect(api.challenge).toHaveBeenCalledWith(
      { address, network: "devnet" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const challenge = challenges[0];
    expect(api.verify).toHaveBeenCalledWith(
      {
        challengeId: challenge?.challengeId,
        signature: fake.keys[0]?.sign(challenge?.message ?? ""),
        provider: "fake-wallet",
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(events.at(-1)).toEqual({ type: "verified", attemptId: 7, address, network: "devnet" });
    expect(events[2]).toEqual({
      type: "challenge-issued",
      attemptId: 7,
      preview: { domain: DOMAIN, address, network: "devnet" },
    });
    expect(api.linkChallenge).not.toHaveBeenCalled();
    expect(api.linkVerify).not.toHaveBeenCalled();
  });

  it("links with the link endpoints only", async () => {
    const { events, api, done } = start(createFakeWallet(), { mode: "link" });
    await done;
    expect(types(events).at(-1)).toBe("verified");
    expect(api.linkChallenge).toHaveBeenCalledTimes(1);
    expect(api.linkVerify).toHaveBeenCalledTimes(1);
    expect(api.challenge).not.toHaveBeenCalled();
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("asks for an account when several are connected and signs with the chosen key", async () => {
    const fake = createFakeWallet({ accountCount: 2 });
    const { events, api, challenges, selectAccount, done } = start(fake);
    await done;
    expect(selectAccount).toHaveBeenCalledTimes(1);
    expect(selectAccount.mock.calls[0]?.[0].map((a) => a.address)).toEqual(
      fake.keys.map((k) => k.address),
    );
    expect(types(events)).toEqual([
      "start",
      "choose-account",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
    expect(events[2]).toMatchObject({ address: fake.keys[1]?.address });
    expect(api.verify.mock.calls[0]?.[0].signature).toBe(
      fake.keys[1]?.sign(challenges[0]?.message ?? ""),
    );
  });

  it("skips the picker for a preferredAddress among the accounts", async () => {
    const fake = createFakeWallet({ accountCount: 2 });
    const { events, selectAccount, done } = start(fake, {
      preferredAddress: fake.keys[1]?.address,
    });
    await done;
    expect(selectAccount).not.toHaveBeenCalled();
    expect(events[1]).toEqual({
      type: "account-selected",
      attemptId: 7,
      address: fake.keys[1]?.address,
    });
  });
});

describe("runFlow: wallet failures", () => {
  it("reports a rejection at connect and never requests a challenge", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "reject", rejectOn: "connect" }));
    await done;
    expect(events).toEqual([
      { type: "start", attemptId: 7, walletName: "Fake Wallet" },
      { type: "wallet-error", attemptId: 7, kind: "rejected" },
    ]);
    expect(api.challenge).not.toHaveBeenCalled();
  });

  it.each(["standard-4001", "phantom", "solflare", "wrapped"] as const)(
    "reports a %s rejection at sign and never verifies",
    async (rejectionShape) => {
      const { events, api, done } = start(createFakeWallet({ mode: "reject", rejectionShape }));
      await done;
      expect(events.at(-1)).toEqual({ type: "wallet-error", attemptId: 7, kind: "rejected" });
      expect(types(events)).not.toContain("signed");
      expect(api.verify).not.toHaveBeenCalled();
    },
  );

  it("reports a disconnect once and never verifies", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "disconnect" }));
    await done;
    expect(events.filter((event) => event.type === "wallet-error")).toEqual([
      { type: "wallet-error", attemptId: 7, kind: "disconnected" },
    ]);
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("reports account-changed when the selected account disappears, then stops", async () => {
    const { events, api, done } = start(createFakeWallet({ mode: "switch-account" }));
    await done;
    expect(events.at(-1)).toEqual({ type: "account-changed", attemptId: 7 });
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("reports a signature that is not 64 bytes as a generic wallet error", async () => {
    const fake = createFakeWallet();
    const wallet = {
      ...fake.wallet,
      accounts: fake.wallet.accounts,
      features: {
        ...fake.wallet.features,
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async (input: { message: Uint8Array }) => [
            { signedMessage: input.message, signature: new Uint8Array(63) },
          ],
        },
      },
    };
    const { events, api, done } = start(fake, { entry: { ...entryFor(fake), wallet } });
    await done;
    expect(events.at(-1)).toEqual({ type: "wallet-error", attemptId: 7, kind: "other" });
    expect(api.verify).not.toHaveBeenCalled();
  });
});

describe("runFlow: API failures", () => {
  it("turns a 429 into api-error with retryAt = now + Retry-After", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.challenge.mockResolvedValue({
      ok: false,
      code: "RATE_LIMITED",
      message: "m",
      retryAfter: 42,
    });
    const { events, done } = start(fake, { api, now: () => 1_000 });
    await done;
    expect(events.at(-1)).toEqual({
      type: "api-error",
      attemptId: 7,
      code: "RATE_LIMITED",
      message: "m",
      retryAt: 43_000,
    });
  });

  it("refuses to sign a challenge for another domain", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.challenge.mockImplementation(async ({ address, network }) => ({
      ok: true,
      data: challengeFor({ address, network, domain: "evil.test" }),
    }));
    const { events, done } = start(fake, { api });
    await done;
    expect(events.at(-1)).toMatchObject({ type: "api-error", code: "UNEXPECTED_RESPONSE" });
    expect(fake.calls.signMessage).toBe(0);
  });

  it("passes a verify failure through as api-error without retryAt", async () => {
    const { api } = fakeApi();
    api.verify.mockResolvedValue({ ok: false, code: "AUTH_FAILED", message: "m" });
    const { events, done } = start(createFakeWallet(), { api });
    await done;
    expect(events.at(-1)).toEqual({
      type: "api-error",
      attemptId: 7,
      code: "AUTH_FAILED",
      message: "m",
      retryAt: undefined,
    });
  });
});

describe("runFlow: cancellation", () => {
  it("stops a hung wallet on abort, dispatches nothing more and resolves", async () => {
    const fake = createFakeWallet({ mode: "hang" });
    const { events, api, controller, done } = start(fake);
    await vi.waitFor(() => expect(types(events)).toContain("challenge-issued"));
    const count = events.length;
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(events).toHaveLength(count);
    expect(fake.calls.signMessage).toBe(1);
    expect(api.verify).not.toHaveBeenCalled();
  });

  it("aborts the in-flight challenge request and dispatches nothing after abort", async () => {
    const { api } = fakeApi();
    let seen: AbortSignal | undefined;
    api.challenge.mockImplementation(
      (_input, options) =>
        new Promise((resolve) => {
          seen = options?.signal;
          options?.signal?.addEventListener("abort", () =>
            resolve({ ok: false, code: "ABORTED", message: "aborted" }),
          );
        }),
    );
    const { events, controller, done } = start(createFakeWallet(), { api });
    await vi.waitFor(() => expect(seen).toBeDefined());
    controller.abort();
    await done;
    expect(seen?.aborted).toBe(true);
    expect(types(events)).toEqual(["start", "account-selected"]);
  });

  it("ignores a change event after the signature was produced", async () => {
    const fake = createFakeWallet();
    const { api } = fakeApi();
    api.verify.mockImplementation(async () => {
      fake.emitChange({ accounts: [] });
      return { ok: true, data: SIGN_IN };
    });
    const { events, done } = start(fake, { api });
    await done;
    expect(types(events)).toEqual([
      "start",
      "account-selected",
      "challenge-issued",
      "signed",
      "verified",
    ]);
  });

  it("dispatches nothing when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, done } = start(createFakeWallet(), { signal: controller.signal });
    await done;
    expect(events).toEqual([]);
  });
});
```

Create `tests/ui/wallet-connect/use-connect-flow.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConnectFlow, type FlowApi, type WalletEntry } from "@/modules/wallet-connect";
import { challengeFor } from "../../helpers/fake-api";
import { createFakeWallet, type FakeWallet } from "../../helpers/fake-wallet";

const SIGN_IN = {
  user: { id: "a".repeat(24) },
  wallet: { id: "b".repeat(24), address: "x", network: "devnet" as const },
};

function entryFor(fake: FakeWallet): WalletEntry {
  return {
    id: fake.wallet.name,
    name: fake.wallet.name,
    icon: fake.wallet.icon,
    canSignIn: true,
    wallet: fake.wallet,
  };
}

function recordingApi() {
  const signals: AbortSignal[] = [];
  const api: FlowApi = {
    challenge: vi.fn<FlowApi["challenge"]>(async ({ address, network }, options) => {
      if (options?.signal !== undefined) signals.push(options.signal);
      return { ok: true, data: challengeFor({ address, network }) };
    }),
    linkChallenge: vi.fn<FlowApi["linkChallenge"]>(),
    verify: vi.fn<FlowApi["verify"]>(async () => ({ ok: true, data: SIGN_IN })),
    linkVerify: vi.fn<FlowApi["linkVerify"]>(),
  };
  return { api, signals };
}

describe("useConnectFlow", () => {
  it("drops the first attempt's events when start is called again", async () => {
    const { api, signals } = recordingApi();
    const hanging = createFakeWallet({ name: "Hanging", mode: "hang" });
    const approving = createFakeWallet({ name: "Approving" });
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(hanging), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    act(() => result.current.start(entryFor(approving), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.state).toMatchObject({
      attemptId: 2,
      address: approving.keys[0]?.address,
    });
    expect(signals[0]?.aborted).toBe(true);
    expect(api.verify).toHaveBeenCalledTimes(1);
  });

  it("aborts the running attempt on unmount", async () => {
    const { api, signals } = recordingApi();
    const { result, unmount } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(createFakeWallet({ mode: "hang" })), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    expect(signals[0]?.aborted).toBe(false);
    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("resolves the account picker through chooseAccount", async () => {
    const { api } = recordingApi();
    const fake = createFakeWallet({ accountCount: 2 });
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(fake), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("choosing-account"));
    act(() => result.current.chooseAccount(fake.keys[1]?.address ?? ""));
    await waitFor(() => expect(result.current.state.status).toBe("done"));
    expect(result.current.state).toMatchObject({ address: fake.keys[1]?.address });
  });

  it("cancel aborts and resets to idle", async () => {
    const { api, signals } = recordingApi();
    const { result } = renderHook(() => useConnectFlow({ mode: "sign-in", api }));
    act(() => result.current.start(entryFor(createFakeWallet({ mode: "hang" })), "devnet"));
    await waitFor(() => expect(result.current.state.status).toBe("awaiting-signature"));
    act(() => result.current.cancel());
    expect(result.current.state).toEqual({ status: "idle", attemptId: 1 });
    expect(signals[0]?.aborted).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/run-flow.test.ts && bunx vitest run --project ui tests/ui/wallet-connect/use-connect-flow.test.tsx`
Expected: FAIL: `runFlow` / `useConnectFlow` are not exported.

- [ ] **Step 3: Implement**

Create `src/modules/wallet-connect/internal/run-flow.ts`:

```ts
import type { WalletAccount } from "@wallet-standard/base";
import type { SolanaNetwork } from "@/modules/validation";
import type { ApiClient, ApiFailure } from "./api-client";
import { encodeBase58 } from "./base58";
import { parseChallengePreview } from "./challenge-preview";
import { classifyWalletError } from "./errors";
import { getConnect, getEvents, getSignMessage } from "./features";
import type { AccountOption, FlowEvent, FlowMode } from "./flow";
import { toProviderId } from "./provider-id";
import type { WalletEntry } from "./registry";

export interface FlowApi {
  readonly challenge: ApiClient["challenge"];
  readonly verify: ApiClient["verify"];
  readonly linkChallenge: ApiClient["linkChallenge"];
  readonly linkVerify: ApiClient["linkVerify"];
}

export interface RunFlowOptions {
  readonly mode: FlowMode;
  readonly entry: WalletEntry;
  readonly network: SolanaNetwork;
  readonly attemptId: number;
  /** Aborted when the modal closes or a new attempt starts. */
  readonly signal: AbortSignal;
  readonly dispatch: (event: FlowEvent) => void;
  readonly api: FlowApi;
  /** window.location.host in the browser; the challenge message's domain must equal it. */
  readonly expectedDomain: string;
  /** Skips the picker when this address is among the connected accounts (retry keeps the choice). */
  readonly preferredAddress?: string;
  /** Resolves with the chosen address; rejects with an AbortError when signal aborts. */
  readonly selectAccount: (
    accounts: readonly AccountOption[],
    signal: AbortSignal,
  ) => Promise<string>;
  /** Default Date.now; used only for retryAt. */
  readonly now?: () => number;
}

const SIGNATURE_BYTES = 64;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Rejects with an AbortError as soon as `signal` aborts, so a hung wallet never blocks cancel.
 * Handlers are always attached to `promise`, so a wallet rejection after an abort is never an
 * unhandled rejection.
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function uniqueByAddress(accounts: readonly WalletAccount[]): WalletAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    if (seen.has(account.address)) return false;
    seen.add(account.address);
    return true;
  });
}

/**
 * The sign-in / link driver: connect → pick account → challenge → signMessage → verify, as
 * reducer events. Never rejects. Dispatches only for its own attemptId and never after its
 * signal (or its internal controller, linked to it) aborted. A standard:events "change"
 * subscription runs until the signature is produced: no accounts → disconnected; the selected
 * account gone → account-changed. Both abort the attempt.
 */
export async function runFlow(options: RunFlowOptions): Promise<void> {
  const { mode, entry, network, attemptId, api } = options;
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const sig = controller.signal;
  const forwardAbort = (): void => controller.abort();
  if (options.signal.aborted) controller.abort();
  else options.signal.addEventListener("abort", forwardAbort, { once: true });

  const dispatch = (event: FlowEvent): void => {
    if (!sig.aborted) options.dispatch(event);
  };
  const apiError = (failure: ApiFailure): void => {
    const retryAt =
      failure.code === "RATE_LIMITED"
        ? now() + (failure.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000
        : undefined;
    dispatch({
      type: "api-error",
      attemptId,
      code: failure.code,
      message: failure.message,
      retryAt,
    });
  };

  let unsubscribe: (() => void) | null = null;
  const stopListening = (): void => {
    const off = unsubscribe;
    unsubscribe = null;
    off?.();
  };
  let selected: string | null = null;
  let signedYet = false;

  try {
    dispatch({ type: "start", attemptId, walletName: entry.name });

    const events = getEvents(entry.wallet);
    if (events !== null) {
      unsubscribe = events.on("change", (properties) => {
        if (signedYet || sig.aborted || properties.accounts === undefined) return;
        if (properties.accounts.length === 0) {
          dispatch({ type: "wallet-error", attemptId, kind: "disconnected" });
          controller.abort();
          return;
        }
        if (selected !== null && !properties.accounts.some((a) => a.address === selected)) {
          dispatch({ type: "account-changed", attemptId });
          controller.abort();
        }
      });
    }

    const connect = getConnect(entry.wallet);
    const signMessage = getSignMessage(entry.wallet);
    if (connect === null || signMessage === null) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }

    let connected: readonly WalletAccount[];
    try {
      connected = (await raceAbort(connect.connect(), sig)).accounts;
    } catch (error) {
      if (!sig.aborted)
        dispatch({ type: "wallet-error", attemptId, kind: classifyWalletError(error) });
      return;
    }
    const accounts = uniqueByAddress(connected.length > 0 ? connected : entry.wallet.accounts);
    if (accounts.length === 0) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }

    let address: string;
    const preferred = options.preferredAddress;
    if (preferred !== undefined && accounts.some((a) => a.address === preferred)) {
      address = preferred;
    } else if (accounts.length === 1) {
      address = (accounts[0] as WalletAccount).address;
    } else {
      const choices: AccountOption[] = accounts.map((a) => ({
        address: a.address,
        label: a.label ?? null,
      }));
      dispatch({ type: "choose-account", attemptId, accounts: choices });
      try {
        address = await raceAbort(options.selectAccount(choices, sig), sig);
      } catch {
        return;
      }
    }
    const account = accounts.find((a) => a.address === address);
    if (account === undefined) return;
    dispatch({ type: "account-selected", attemptId, address });
    selected = address;

    const issue = mode === "sign-in" ? api.challenge : api.linkChallenge;
    const challenge = await issue({ address, network }, { signal: sig });
    if (sig.aborted) return;
    if (!challenge.ok) {
      apiError(challenge);
      return;
    }
    const preview = parseChallengePreview(challenge.data.message, {
      address,
      network,
      domain: options.expectedDomain,
    });
    if (preview === null) {
      apiError({ ok: false, code: "UNEXPECTED_RESPONSE", message: "challenge mismatch" });
      return;
    }
    dispatch({ type: "challenge-issued", attemptId, preview });

    let signature: Uint8Array | undefined;
    try {
      const outputs = await raceAbort(
        signMessage.signMessage({
          account,
          message: new TextEncoder().encode(challenge.data.message),
        }),
        sig,
      );
      signature = outputs[0]?.signature;
    } catch (error) {
      if (!sig.aborted)
        dispatch({ type: "wallet-error", attemptId, kind: classifyWalletError(error) });
      return;
    }
    if (signature === undefined || signature.length !== SIGNATURE_BYTES) {
      dispatch({ type: "wallet-error", attemptId, kind: "other" });
      return;
    }
    signedYet = true;
    stopListening();
    dispatch({ type: "signed", attemptId });

    const confirm = mode === "sign-in" ? api.verify : api.linkVerify;
    const result = await confirm(
      {
        challengeId: challenge.data.challengeId,
        signature: encodeBase58(signature),
        provider: toProviderId(entry.name),
      },
      { signal: sig },
    );
    if (sig.aborted) return;
    if (!result.ok) {
      apiError(result);
      return;
    }
    dispatch({ type: "verified", attemptId, address, network });
  } catch {
    // Never rejects; an unexpected throw is a generic wallet failure (ignored once verifying).
    dispatch({ type: "wallet-error", attemptId, kind: "other" });
  } finally {
    stopListening();
    options.signal.removeEventListener("abort", forwardAbort);
  }
}
```

Create `src/modules/wallet-connect/internal/use-connect-flow.ts`:

```ts
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { apiClient } from "./api-client";
import { initialFlowState, reduce, type FlowMode, type FlowState } from "./flow";
import { runFlow, type FlowApi } from "./run-flow";
import type { WalletEntry } from "./registry";

export interface StartOptions {
  readonly preferredAddress?: string;
}

export interface ConnectFlow {
  readonly state: FlowState;
  /** Aborts any running attempt, then starts attemptId = previous + 1. */
  start(entry: WalletEntry, network: SolanaNetwork, options?: StartOptions): void;
  /** Resolves the pending account choice; the driver then dispatches account-selected. */
  chooseAccount(address: string): void;
  /** Aborts the running attempt and dispatches reset. Called when the modal closes. */
  cancel(): void;
}

interface PendingChoice {
  readonly resolve: (address: string) => void;
  readonly reject: (error: unknown) => void;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Reducer + driver + abort handling + account picker. Unmount aborts the running attempt. */
export function useConnectFlow(options: {
  readonly mode: FlowMode;
  readonly api?: FlowApi;
}): ConnectFlow {
  const { mode } = options;
  const api = options.api ?? apiClient;
  const [state, dispatch] = useReducer(reduce, initialFlowState);
  const attemptCounter = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<PendingChoice | null>(null);

  const abortCurrent = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    pending.current?.reject(abortError());
    pending.current = null;
  }, []);

  const start = useCallback(
    (entry: WalletEntry, network: SolanaNetwork, startOptions: StartOptions = {}) => {
      abortCurrent();
      attemptCounter.current += 1;
      const next = new AbortController();
      controller.current = next;
      void runFlow({
        mode,
        entry,
        network,
        attemptId: attemptCounter.current,
        signal: next.signal,
        dispatch,
        api,
        expectedDomain: window.location.host,
        preferredAddress: startOptions.preferredAddress,
        selectAccount: (_accounts, signal) =>
          new Promise<string>((resolve, reject) => {
            pending.current = { resolve, reject };
            signal.addEventListener("abort", () => reject(abortError()), { once: true });
          }),
      });
    },
    [abortCurrent, api, mode],
  );

  const chooseAccount = useCallback((address: string) => {
    const choice = pending.current;
    pending.current = null;
    choice?.resolve(address);
  }, []);

  const cancel = useCallback(() => {
    abortCurrent();
    dispatch({ type: "reset" });
  }, [abortCurrent]);

  useEffect(() => abortCurrent, [abortCurrent]);

  return useMemo(
    () => ({ state, start, chooseAccount, cancel }),
    [state, start, chooseAccount, cancel],
  );
}
```

Replace the whole of `src/modules/wallet-connect/index.ts` with:

```ts
export { listSolanaWallets, refreshWallets, subscribeWallets } from "./internal/registry";
export type { WalletEntry } from "./internal/registry";
export { useWallets } from "./internal/use-wallets";
export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption,
  FlowEvent,
  FlowFailureCode,
  FlowMode,
  FlowState,
  FlowStatus,
  SignPreview,
} from "./internal/flow";
export { runFlow } from "./internal/run-flow";
export type { FlowApi, RunFlowOptions } from "./internal/run-flow";
export { useConnectFlow } from "./internal/use-connect-flow";
export type { ConnectFlow, StartOptions } from "./internal/use-connect-flow";
export { classifyWalletError } from "./internal/errors";
export type { WalletErrorKind } from "./internal/errors";
export { parseChallengePreview } from "./internal/challenge-preview";
export { toProviderId } from "./internal/provider-id";
export { encodeBase58 } from "./internal/base58";
export {
  apiClient,
  challenge,
  linkChallenge,
  linkVerify,
  listSessions,
  listWallets,
  logout,
  me,
  onUnauthenticated,
  revokeSession,
  unlinkWallet,
  verify,
} from "./internal/api-client";
export type { ApiClient, ApiFailure, ApiResult, RequestOptions } from "./internal/api-client";
export type {
  ChallengeData,
  LinkData,
  MeData,
  SessionItem,
  SignInData,
  WalletItem,
} from "./internal/schemas";
```

- [ ] **Step 4: Run to verify they pass**

Run: `bunx vitest run --project unit tests/unit/wallet-connect/run-flow.test.ts && bunx vitest run --project ui tests/ui/wallet-connect/use-connect-flow.test.tsx`
Expected: PASS, `19` unit and `4` ui tests, and **no** `Unhandled Errors` section. `raceAbort` must attach handlers to the wallet promise even when the signal is already aborted; otherwise the disconnect case reports an unhandled `WalletDisconnectedError` (Vitest prints `Errors 1 error` and exits 1).
What would make it fail: signing before checking the preview (the "another domain" case asserts `calls.signMessage` is 0), dispatching after abort (the hang and in-flight-challenge cases), or keeping the `change` listener after signing (the "change after signed" case).

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  1055 passed (1055)`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/wallet-connect/internal/run-flow.ts src/modules/wallet-connect/internal/use-connect-flow.ts src/modules/wallet-connect/index.ts tests/unit/wallet-connect/run-flow.test.ts tests/ui/wallet-connect/use-connect-flow.test.tsx
git commit -m "feat(wallet-connect): add abortable sign-in and link driver and hook" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 11: Design tokens, self-hosted fonts and the display primitives

Spec §6, architecture §3.2 and §6.1/§6.6. Tailwind v4 tokens in `@theme`, fonts from `node_modules` through `next/font/local`, and the server-safe or simple client primitives. The root layout gains the fonts, `SkipLink` and `ToastProvider` (which stays mounted across navigations).

**Files:**
- Create: `src/app/globals.css`, `src/app/fonts.ts`, `src/ui/cn.ts`, `src/ui/button.tsx`, `src/ui/card.tsx`, `src/ui/badge.tsx`, `src/ui/spinner.tsx`, `src/ui/ghost-logo.tsx`, `src/ui/skip-link.tsx`, `src/ui/date-time.tsx`, `src/ui/network-indicator.tsx`, `src/ui/address.tsx`, `src/ui/toast.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/ui/ui/button.test.tsx`, `tests/ui/ui/spinner.test.tsx`, `tests/ui/ui/toast.test.tsx`, `tests/ui/ui/address.test.tsx`, `tests/ui/ui/date-time.test.tsx`

**Interfaces:**
- Consumes: `type SolanaNetwork` (`@/modules/validation`); `lucide-react` (`Copy`); `connection()` from `next/server` (kept from Task 6).
- Produces (all under `@/ui/…`, no domain logic):
  - `cn(...parts: readonly (string | false | null | undefined)[]): string`
  - `type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"`; `interface ButtonProps extends ComponentPropsWithRef<"button"> { variant?; loading?; loadingLabel? }`; `Button` (`type="button"` default, `min-h-11`; loading → `aria-busy` + `aria-disabled`, clicks ignored, label kept invisible, screen-reader `loadingLabel` default "Working…")
  - `Card({ title?, headingLevel?: 2 | 3, as?: "section" | "div" | "article", children, className? })`; `type BadgeTone = "neutral" | "violet" | "success" | "warning" | "error"`, `Badge({ tone?, children })`; `Spinner({ label })`; `GhostLogo({ className? })` (text "GHOST WIRE"); `SkipLink({ href? })` ("Skip to content" → `#main`)
  - `formatUtc(iso: string): string` and `DateTime({ iso })` (UTC, "Nov 13, 2026, 10:00 AM UTC"; an invalid value is returned unchanged)
  - `networkLabel(network): "Devnet" | "Mainnet-beta"`, `NetworkIndicator({ network })` (dot + text)
  - `truncateAddress(value: string): string` ("AbCd…WxYz"; ≤ 10 characters unchanged), `Address({ value, copyable?, className? })` ("use client"; full value in `title` and sr-only text; copyable adds a "Copy address" button and its own `role="status"` that clears after 2000 ms)
  - `type ToastTone = "info" | "success" | "error"`, `interface ToastInput { message; tone? }`, `ToastProvider({ children })`, `useToast(): { show(input: ToastInput): void; dismiss(id: number): void }` (two always-present regions: polite `role="status"` for info/success, `role="alert"` for errors; each toast has "Dismiss" and auto-dismisses after 6000 ms; `useToast` throws outside the provider)
  - Tailwind utilities from the tokens: `bg-obsidian`, `bg-surface`, `bg-elevated`, `border-border`, `text-text`, `text-muted`, `text-silver`, `bg-violet`/`text-violet`, `bg-violet-hover`, `text-success`/`bg-success`, `bg-warning`, `text-error`/`bg-error`, `rounded-card`, `rounded-control`, `font-sans`, `font-heading`, `font-mono`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/ui/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/ui/button";

describe("Button", () => {
  it("defaults to type=button and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("type")).toBe("button");
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["primary", "bg-violet"],
    ["secondary", "border-muted"],
    ["ghost", "bg-transparent"],
    ["danger", "bg-error"],
  ] as const)("renders the %s variant", (variant, token) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button").className).toContain(token);
  });

  it("while loading: aria-busy, aria-disabled, ignores clicks, keeps the label in the DOM", async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Signing out…" onClick={onClick}>
        Sign out
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("Sign out");
    expect(button.textContent).toContain("Signing out…");
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is natively disabled when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Retry
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.setup().click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

Create `tests/ui/ui/spinner.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "@/ui/spinner";

describe("Spinner", () => {
  it("always shows its label as text and hides the ring and dot from assistive tech", () => {
    const { container } = render(<Spinner label="Verifying…" />);
    expect(screen.getByText("Verifying…")).toBeTruthy();
    const ring = container.querySelector('[data-part="ring"]');
    const dot = container.querySelector('[data-part="dot"]');
    expect(ring?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(ring?.className).toContain("motion-reduce:hidden");
    expect(dot?.className).toContain("motion-reduce:inline-block");
  });
});
```

Create `tests/ui/ui/toast.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastInput } from "@/ui/toast";

afterEach(() => {
  vi.useRealTimers();
});

/** One "Show N" button per input. */
function Probe({ inputs }: { readonly inputs: readonly ToastInput[] }) {
  const { show } = useToast();
  return (
    <>
      {inputs.map((input, index) => (
        <button key={input.message} type="button" onClick={() => show(input)}>
          {`Show ${index}`}
        </button>
      ))}
    </>
  );
}

function setup(inputs: readonly ToastInput[]) {
  render(
    <ToastProvider>
      <Probe inputs={inputs} />
    </ToastProvider>,
  );
  return (index: number) => fireEvent.click(screen.getByRole("button", { name: `Show ${index}` }));
}

describe("ToastProvider", () => {
  it("renders both live regions before any toast exists", () => {
    setup([]);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("puts info and success in the status region and errors in the alert region", () => {
    const show = setup([
      { message: "Session revoked." },
      { message: "Wallet linked.", tone: "success" },
      { message: "Something went wrong. Try again.", tone: "error" },
    ]);
    show(0);
    show(1);
    show(2);
    const status = screen.getByRole("status").textContent;
    expect(status).toContain("Session revoked.");
    expect(status).toContain("Wallet linked.");
    expect(status).not.toContain("Something went wrong");
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Try again.");
  });

  it("removes a toast with Dismiss", async () => {
    const show = setup([{ message: "You're signed out." }]);
    show(0);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("auto-dismisses after 6000 ms", () => {
    vi.useFakeTimers();
    const show = setup([{ message: "Address copied" }]);
    show(0);
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole("status").textContent).toContain("Address copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("throws when useToast is used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe inputs={[]} />)).toThrow(
      "useToast must be used inside ToastProvider",
    );
  });
});
```

Create `tests/ui/ui/address.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Address, truncateAddress } from "@/ui/address";

const FULL = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";

afterEach(() => {
  vi.useRealTimers();
});

describe("truncateAddress", () => {
  it.each([
    [FULL, "7Np4…T4K2"],
    ["abcdefghijk", "abcd…hijk"],
    ["abcdefghij", "abcdefghij"],
    ["", ""],
  ])("%s → %s", (value, expected) => {
    expect(truncateAddress(value)).toBe(expected);
  });
});

describe("Address", () => {
  it("shows the truncated value, keeps the full value in sr-only text and title", () => {
    const { container } = render(<Address value={FULL} />);
    const mono = container.querySelector(".font-mono");
    expect(mono?.getAttribute("title")).toBe(FULL);
    expect(mono?.querySelector('[aria-hidden="true"]')?.textContent).toBe("7Np4…T4K2");
    expect(mono?.querySelector(".sr-only")?.textContent).toBe(FULL);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("copies the full value and announces it, then clears the announcement", async () => {
    const user = userEvent.setup();
    render(<Address value={FULL} copyable />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(await navigator.clipboard.readText()).toBe(FULL);
    expect(screen.getByRole("status").textContent).toBe("Address copied");
  });

  it("announces a failed copy", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<Address value={FULL} copyable />);
    await user.click(screen.getByRole("button", { name: "Copy address" }));
    expect(screen.getByRole("status").textContent).toBe("Couldn't copy the address");
  });

  it("clears the status after 2000 ms", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<Address value={FULL} copyable />);
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Address copied");
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole("status").textContent).toBe("Address copied");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
```

Create `tests/ui/ui/date-time.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateTime, formatUtc } from "@/ui/date-time";
import { NetworkIndicator, networkLabel } from "@/ui/network-indicator";

describe("DateTime", () => {
  it("formats in UTC with a UTC suffix, independent of the local time zone", () => {
    expect(formatUtc("2026-11-13T23:30:00.000Z")).toBe("Nov 13, 2026, 11:30 PM UTC");
  });

  it("renders a <time> with the ISO value", () => {
    const { container } = render(<DateTime iso="2026-11-13T10:00:00.000Z" />);
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-11-13T10:00:00.000Z");
    expect(time?.textContent).toBe("Nov 13, 2026, 10:00 AM UTC");
  });

  it("returns an invalid value unchanged instead of throwing", () => {
    expect(formatUtc("not a date")).toBe("not a date");
  });
});

describe("NetworkIndicator", () => {
  it.each([
    ["devnet", "Devnet", "bg-success"],
    ["mainnet-beta", "Mainnet-beta", "bg-warning"],
  ] as const)("shows %s as text plus a hidden dot", (network, label, dot) => {
    const { container } = render(<NetworkIndicator network={network} />);
    expect(networkLabel(network)).toBe(label);
    expect(screen.getByText(label)).toBeTruthy();
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker?.className).toContain(dot);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project ui tests/ui/ui`
Expected: FAIL, each file with `Failed to resolve import "@/ui/…"`.

- [ ] **Step 3: Implement the tokens, fonts and layout**

Create `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-obsidian: #09090e;
  --color-surface: #111118;
  --color-elevated: #17151f;
  --color-border: #292936;
  --color-text: #ffffff;
  --color-muted: #a1a1aa;
  --color-silver: #c4c4ce;
  --color-violet: #a78bfa;
  --color-violet-hover: #8b5cf6;
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-error: #fb7185;
  --radius-card: 16px;
  --radius-control: 10px;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-heading: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --default-transition-duration: 200ms;
}

@layer base {
  html {
    color-scheme: dark;
  }
  body {
    background-color: var(--color-obsidian);
    color: var(--color-text);
  }
  :focus-visible {
    outline: 2px solid var(--color-violet);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

Create `src/app/fonts.ts`:

```ts
import localFont from "next/font/local";

// Self-hosted from node_modules (no build-time or runtime third-party fetch). Paths are relative
// to this file, so it must stay at src/app/fonts.ts. Latin subsets only.
export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const spaceGrotesk = localFont({
  src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

export const geistMono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});
```

Replace the whole of `src/app/layout.tsx` with:

```tsx
import "./globals.css";
import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SkipLink } from "@/ui/skip-link";
import { ToastProvider } from "@/ui/toast";
import { geistMono, inter, spaceGrotesk } from "./fonts";

export const metadata: Metadata = {
  title: "GHOST WIRE",
  description: "Your money. Your business. Your privacy.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Every page renders per request, so the proxy's CSP nonce reaches every page (spike §9.4).
  await connection();
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-obsidian font-sans text-text antialiased">
        <SkipLink />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Implement the primitives**

Create `src/ui/cn.ts`:

```ts
/** Joins the truthy class names with single spaces. */
export function cn(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}
```

Create `src/ui/button.tsx`:

```tsx
import type { ComponentPropsWithRef, MouseEvent } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Default "primary". */
  readonly variant?: ButtonVariant;
  /**
   * aria-busy="true" + aria-disabled="true"; clicks are ignored; the label stays rendered
   * (invisible) so the width is kept, and a spinner overlays it.
   */
  readonly loading?: boolean;
  /** Screen-reader text while loading; default "Working…". */
  readonly loadingLabel?: string;
}

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-violet text-obsidian hover:bg-violet-hover",
  secondary: "border border-muted bg-transparent text-text hover:bg-elevated",
  ghost: "bg-transparent text-text hover:bg-elevated",
  danger: "bg-error text-obsidian hover:bg-error/90",
};

/** type="button" by default; at least 44px tall. Violet is reserved for the primary variant. */
export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Working…",
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      onClick={handleClick}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : rest["aria-disabled"]}
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
    >
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
      {loading && (
        <>
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:hidden" />
            <span className="hidden size-2 rounded-full bg-current motion-reduce:inline-block" />
          </span>
          <span className="sr-only">{loadingLabel}</span>
        </>
      )}
    </button>
  );
}
```

Create `src/ui/card.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  readonly title?: string;
  /** Default 2. */
  readonly headingLevel?: 2 | 3;
  /** Default "section". */
  readonly as?: "section" | "div" | "article";
  readonly children: ReactNode;
  readonly className?: string;
}

function headingId(title: string): string {
  return `card-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** A surface panel. With a title, a section/article is labelled by its heading. */
export function Card({ title, headingLevel = 2, as = "section", children, className }: CardProps) {
  const Tag = as;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const id = title === undefined ? undefined : headingId(title);
  return (
    <Tag
      aria-labelledby={as !== "div" ? id : undefined}
      className={cn("rounded-card border border-border bg-surface p-5", className)}
    >
      {title !== undefined && (
        <Heading id={id} className="mb-3 font-heading text-lg font-semibold text-text">
          {title}
        </Heading>
      )}
      {children}
    </Tag>
  );
}
```

Create `src/ui/badge.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "violet" | "success" | "warning" | "error";

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "border-muted text-silver",
  violet: "border-violet text-violet",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  error: "border-error text-error",
};

/** A text label; the tone only reinforces the text, never replaces it. */
export function Badge({
  tone = "neutral",
  children,
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
```

Create `src/ui/spinner.tsx`:

```tsx
/**
 * Animated ring (aria-hidden) + visible label. Under prefers-reduced-motion the ring is replaced
 * by a static dot; the label is always visible text.
 */
export function Spinner({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        data-part="ring"
        className="size-4 animate-spin rounded-full border-2 border-violet border-t-transparent motion-reduce:hidden"
      />
      <span
        aria-hidden="true"
        data-part="dot"
        className="hidden size-2 rounded-full bg-violet motion-reduce:inline-block"
      />
      <span>{label}</span>
    </span>
  );
}
```

Create `src/ui/ghost-logo.tsx`:

```tsx
import { cn } from "./cn";

/** Text wordmark until the final logo artwork is approved (BRAND_IDENTITY §4). */
export function GhostLogo({ className }: { readonly className?: string }) {
  return (
    <span className={cn("font-heading text-lg font-bold tracking-[0.2em] text-text", className)}>
      GHOST WIRE
    </span>
  );
}
```

Create `src/ui/skip-link.tsx`:

```tsx
/** First focusable element on every page; jumps to <main id="main">. */
export function SkipLink({ href = "#main" }: { readonly href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:bg-violet focus:px-4 focus:py-2 focus:text-obsidian"
    >
      Skip to content
    </a>
  );
}
```

Create `src/ui/date-time.tsx`:

```tsx
const FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** "Nov 13, 2026, 10:00 AM UTC". Deterministic on server and client (no hydration mismatch). */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${FORMAT.format(date)} UTC`;
}

export function DateTime({ iso }: { readonly iso: string }) {
  return <time dateTime={iso}>{formatUtc(iso)}</time>;
}
```

Create `src/ui/network-indicator.tsx`:

```tsx
import type { SolanaNetwork } from "@/modules/validation";
import { cn } from "./cn";

export function networkLabel(network: SolanaNetwork): "Devnet" | "Mainnet-beta" {
  return network === "devnet" ? "Devnet" : "Mainnet-beta";
}

/** A dot (aria-hidden) plus the network name as text, so colour is never the only signal. */
export function NetworkIndicator({ network }: { readonly network: SolanaNetwork }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-silver">
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", network === "devnet" ? "bg-success" : "bg-warning")}
      />
      {networkLabel(network)}
    </span>
  );
}
```

Create `src/ui/address.tsx`:

```tsx
"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { cn } from "./cn";

const STATUS_CLEAR_MS = 2000;

/** "AbCd…WxYz" (4 + "…" + 4); values of 10 characters or fewer are returned unchanged. */
export function truncateAddress(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export interface AddressProps {
  readonly value: string;
  readonly copyable?: boolean;
  readonly className?: string;
}

/**
 * Mono, truncated text; the full value is in visually hidden text and `title`. `copyable` adds a
 * "Copy address" button whose own status region announces the result and clears after 2 s.
 */
export function Address({ value, copyable = false, className }: AddressProps) {
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (status === "") return;
    const timer = setTimeout(() => setStatus(""), STATUS_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Address copied");
    } catch {
      setStatus("Couldn't copy the address");
    }
  };

  const text = (
    <span className={cn("font-mono", className)} title={value}>
      <span aria-hidden="true">{truncateAddress(value)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
  if (!copyable) return text;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {text}
      <Button variant="ghost" className="px-2 text-xs" onClick={() => void copy()}>
        <Copy aria-hidden="true" className="size-4" />
        Copy address
      </Button>
      <span role="status" className="sr-only">
        {status}
      </span>
    </span>
  );
}
```

Create `src/ui/toast.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./button";
import { cn } from "./cn";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  readonly message: string;
  /** Default "info". */
  readonly tone?: ToastTone;
}

interface ToastItem {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

interface ToastApi {
  show(input: ToastInput): void;
  dismiss(id: number): void;
}

const AUTO_DISMISS_MS = 6000;
const ToastContext = createContext<ToastApi | null>(null);

const TONE_BORDER: Readonly<Record<ToastTone, string>> = {
  info: "border-border",
  success: "border-success",
  error: "border-error",
};

/**
 * Renders two always-present live regions (they exist before any content is inserted): a polite
 * role="status" for info/success and a role="alert" for errors. Each toast has a Dismiss button
 * and auto-dismisses after 6000 ms. Mounted once in the root layout so toasts survive navigation.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ message, tone = "info" }: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const render = (toast: ToastItem) => (
    <div
      key={toast.id}
      className={cn(
        "pointer-events-auto flex items-center justify-between gap-3 rounded-control border bg-elevated px-4 py-2 text-sm text-text shadow-lg",
        TONE_BORDER[toast.tone],
      )}
    >
      <span>{toast.message}</span>
      <Button variant="ghost" className="px-3 text-xs" onClick={() => dismiss(toast.id)}>
        Dismiss
      </Button>
    </div>
  );

  return (
    <ToastContext value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        <div role="status" aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.filter((toast) => toast.tone !== "error").map(render)}
        </div>
        <div role="alert" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.filter((toast) => toast.tone === "error").map(render)}
        </div>
      </div>
    </ToastContext>
  );
}

/** show/dismiss from the nearest ToastProvider. Throws outside one (a wiring bug). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside ToastProvider");
  return api;
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `bunx vitest run --project ui tests/ui/ui`
Expected: PASS, `Tests  26 passed`.
What would make it fail: creating a live region only when the first toast appears (screen readers miss it; the "both regions before any toast" case), formatting dates in local time (the 23:30 UTC case), or copying the truncated value instead of the full address.

- [ ] **Step 6: Build and full gate**

Run:
```bash
bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test
bun run build
ls .next/static/media | grep -c woff2
grep -o "\-\-color-violet:[^;]*" .next/static/chunks/*.css | head -1
```
Expected: clean; `Tests  1081 passed (1081)`; the build succeeds with no network access for fonts; `3` font files; `--color-violet:#a78bfa`. Without `postcss.config.mjs` (Task 1) the grep finds nothing: Tailwind v4 runs in Next only through that PostCSS plugin.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/fonts.ts src/app/layout.tsx src/ui/cn.ts src/ui/button.tsx src/ui/card.tsx src/ui/badge.tsx src/ui/spinner.tsx src/ui/ghost-logo.tsx src/ui/skip-link.tsx src/ui/date-time.tsx src/ui/network-indicator.tsx src/ui/address.tsx src/ui/toast.tsx tests/ui/ui/button.test.tsx tests/ui/ui/spinner.test.tsx tests/ui/ui/toast.test.tsx tests/ui/ui/address.test.tsx tests/ui/ui/date-time.test.tsx
git commit -m "feat(ui): add design tokens, self-hosted fonts and display primitives" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 12: Interactive primitives: Dialog, ConfirmDialog, MenuButton, SegmentedControl, WalletStatus

Spec §6 (primitives, accessibility), architecture §3.2 (Dialog behaviour decision). happy-dom's `showModal()` only sets `open` (no focus move, no Escape, no `cancel`, no inertness), so `Dialog` owns those behaviours and behaves the same in happy-dom and Chromium.

**Files:**
- Create: `src/ui/dialog.tsx`, `src/ui/confirm-dialog.tsx`, `src/ui/menu.tsx`, `src/ui/segmented-control.tsx`, `src/ui/wallet-status.tsx`
- Test: `tests/ui/ui/dialog.test.tsx`, `tests/ui/ui/confirm-dialog.test.tsx`, `tests/ui/ui/menu.test.tsx`, `tests/ui/ui/segmented-control.test.tsx`

**Interfaces:**
- Consumes: `Button`, `truncateAddress`, `networkLabel`, `cn` (Task 11); `lucide-react` (`X`, `ChevronDown`, `Check`).
- Produces (all `"use client"`):
  - `Dialog({ open, onClose, title, description?, children, closeLabel? })`: opening stores the focused element, calls `showModal()`, focuses `[data-autofocus]` or the first focusable element; Tab/Shift+Tab wrap; Escape and the native `cancel` call `onClose`; a native `close` while `open` is still true calls `onClose`; closing **or unmounting while open** closes the element and returns focus. Title `<h2>` via `aria-labelledby`, description via `aria-describedby`, a "Close" button always rendered. Parents may mount a dialog only while it is open.
  - `ConfirmDialog({ open, title, body, confirmLabel, cancelLabel?, tone?: "danger" | "primary", pending?, error?, onConfirm, onCancel })`: initial focus on Cancel; `error` renders as `role="alert"`.
  - `interface MenuItem { id; label; onSelect(); tone?: "danger" }`, `MenuButton({ label: ReactNode, accessibleLabel: string, items })`: WAI-ARIA menu button; the button's accessible name is `"{accessibleLabel} {visible label}"` (an sr-only prefix, so the visible text stays in the name, WCAG 2.5.3); the `role="menu"` list has `aria-label={accessibleLabel}`.
  - `SegmentedControl<T extends string>({ legend, name, value, options: { value: T; label }[], onChange, disabled? })`: `<fieldset><legend>` + native radios; the checked segment also shows a Check icon.
  - `WalletStatus({ address, network, onCopyAddress, onSwitchNetwork, onSignOut })`: a `MenuButton` named "Wallet menu AbCd…WxYz" with items "Copy address", "Switch to {other network label}", "Sign out" (danger).

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/ui/dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/ui/dialog";

function Harness({
  onClose = () => undefined,
  autofocus = false,
}: {
  onClose?: () => void;
  autofocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        title="Connect a wallet"
        description="Pick a wallet."
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">First action</button>
        <button type="button" data-autofocus={autofocus ? "" : undefined}>
          Last action
        </button>
      </Dialog>
    </>
  );
}

async function openDialog(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  return user;
}

describe("Dialog", () => {
  it("is not in the accessibility tree while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens modal, labelled by its title and described by its description", async () => {
    await openDialog();
    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    const describedBy = dialog.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Pick a wallet.");
  });

  it("focuses the first focusable element (the Close button) on open", async () => {
    await openDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("focuses [data-autofocus] when present", async () => {
    await openDialog({ autofocus: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last action" }));
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    const user = await openDialog();
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last action" });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First action" }));
    await user.tab();
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const onClose = vi.fn();
    const user = await openDialog({ onClose });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });

  it("closes with the Close button", async () => {
    const onClose = vi.fn();
    const user = await openDialog({ onClose });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when the browser closes the dialog on its own", async () => {
    const onClose = vi.fn();
    await openDialog({ onClose });
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

Create `tests/ui/ui/confirm-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/ui/confirm-dialog";

const BASE = {
  open: true,
  title: "Unlink this wallet?",
  body: "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.",
  confirmLabel: "Unlink",
};

describe("ConfirmDialog", () => {
  it("shows the title and body and focuses Cancel first", () => {
    render(<ConfirmDialog {...BASE} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: BASE.title })).toBeTruthy();
    expect(screen.getByText(BASE.body)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("calls onConfirm and onCancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog {...BASE} onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("marks the confirm button busy while pending", () => {
    render(<ConfirmDialog {...BASE} pending onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const busy = screen.getAllByRole("button").find((b) => b.getAttribute("aria-busy") === "true");
    expect(busy?.textContent).toContain("Unlink");
  });

  it("shows an error in a role=alert paragraph", () => {
    render(
      <ConfirmDialog
        {...BASE}
        error="You can't unlink your only wallet."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("You can't unlink your only wallet.");
  });
});
```

Create `tests/ui/ui/menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuButton } from "@/ui/menu";
import { WalletStatus } from "@/ui/wallet-status";

function setup() {
  const onCopy = vi.fn();
  const onSwitch = vi.fn();
  const onSignOut = vi.fn();
  render(
    <>
      <MenuButton
        label="Account"
        accessibleLabel="Wallet menu"
        items={[
          { id: "copy", label: "Copy address", onSelect: onCopy },
          { id: "switch", label: "Switch to Mainnet-beta", onSelect: onSwitch },
          { id: "out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
        ]}
      />
      <button type="button">Outside</button>
    </>,
  );
  return {
    user: userEvent.setup(),
    button: screen.getByRole("button", { name: /^Wallet menu/ }),
    onCopy,
    onSignOut,
  };
}

const focused = () => document.activeElement?.textContent;

describe("MenuButton", () => {
  it("announces a closed menu button", () => {
    const { button } = setup();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ArrowDown opens and focuses the first item; ArrowUp opens at the last", async () => {
    const { user, button } = setup();
    button.focus();
    await user.keyboard("{ArrowDown}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(screen.getByRole("menu").id);
    expect(focused()).toBe("Copy address");
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Sign out");
  });

  it("Enter on the button opens at the first item", async () => {
    const { user, button } = setup();
    button.focus();
    await user.keyboard("{Enter}");
    expect(focused()).toBe("Copy address");
  });

  it("moves with ArrowDown/ArrowUp (wrapping), Home and End", async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Switch to Mainnet-beta");
    await user.keyboard("{End}");
    expect(focused()).toBe("Sign out");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Copy address");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Sign out");
    await user.keyboard("{Home}");
    expect(focused()).toBe("Copy address");
  });

  it("Enter selects, closes and returns focus to the button", async () => {
    const { user, button, onSignOut } = setup();
    await user.click(button);
    await user.keyboard("{End}{Enter}");
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Escape closes and returns focus; a click outside closes", async () => {
    const { user, button, onCopy } = setup();
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("selects an item by click", async () => {
    const { user, button, onCopy } = setup();
    await user.click(button);
    await user.click(screen.getByRole("menuitem", { name: "Copy address" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});

describe("WalletStatus", () => {
  it.each([
    ["devnet", "Switch to Mainnet-beta"],
    ["mainnet-beta", "Switch to Devnet"],
  ] as const)("offers Copy address, %s → %s and Sign out", async (network, switchLabel) => {
    const onSwitchNetwork = vi.fn();
    const user = userEvent.setup();
    render(
      <WalletStatus
        address="7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2"
        network={network}
        onCopyAddress={vi.fn()}
        onSwitchNetwork={onSwitchNetwork}
        onSignOut={vi.fn()}
      />,
    );
    // The visible truncated address is part of the accessible name (WCAG 2.5.3).
    const button = screen.getByRole("button", { name: "Wallet menu 7Np4…T4K2" });
    await user.click(button);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy address",
      switchLabel,
      "Sign out",
    ]);
    await user.click(screen.getByRole("menuitem", { name: switchLabel }));
    expect(onSwitchNetwork).toHaveBeenCalledTimes(1);
  });
});
```

Create `tests/ui/ui/segmented-control.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "@/ui/segmented-control";

type Network = "devnet" | "mainnet-beta";

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<Network>("devnet");
  return (
    <SegmentedControl
      legend="Network"
      name="network"
      value={value}
      disabled={disabled}
      options={[
        { value: "devnet", label: "Devnet" },
        { value: "mainnet-beta", label: "Mainnet-beta" },
      ]}
      onChange={setValue}
    />
  );
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("SegmentedControl", () => {
  it("is a fieldset with a legend and native radios", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Network" }).tagName).toBe("FIELDSET");
    expect(radio("Devnet").checked).toBe(true);
    expect(radio("Mainnet-beta").checked).toBe(false);
  });

  it("changes the selection by click and by arrow key", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(radio("Mainnet-beta"));
    expect(radio("Mainnet-beta").checked).toBe(true);
    await user.keyboard("{ArrowLeft}");
    expect(radio("Devnet").checked).toBe(true);
  });

  it("disables every option", async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    const group = screen.getByRole("group", { name: "Network" }) as HTMLFieldSetElement;
    expect(group.disabled).toBe(true);
    await user.click(radio("Mainnet-beta"));
    expect(radio("Devnet").checked).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project ui tests/ui/ui/dialog.test.tsx tests/ui/ui/confirm-dialog.test.tsx tests/ui/ui/menu.test.tsx tests/ui/ui/segmented-control.test.tsx`
Expected: FAIL, each file with `Failed to resolve import "@/ui/…"`.

- [ ] **Step 3: Implement**

Create `src/ui/dialog.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./button";

export interface DialogProps {
  readonly open: boolean;
  /** Escape, the Close button, and the native cancel/close events. */
  readonly onClose: () => void;
  /** Rendered as an <h2> wired through aria-labelledby. */
  readonly title: string;
  /** A <p> wired through aria-describedby. */
  readonly description?: string;
  readonly children: ReactNode;
  /** Default "Close". */
  readonly closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Native <dialog> opened with showModal(). The component owns focus, Escape and the Tab trap, so
 * it behaves the same in browsers and in happy-dom (whose showModal() only sets `open`):
 * opening focuses [data-autofocus] or the first focusable element; Tab and Shift+Tab wrap;
 * Escape calls onClose; closing (or unmounting while open) returns focus to the element that was
 * focused when it opened.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  closeLabel = "Close",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || dialog === null) return;
    const active = document.activeElement;
    const returnTo = active instanceof HTMLElement ? active : null;
    if (!dialog.open) dialog.showModal();
    const target = dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(dialog)[0];
    target?.focus();
    // Runs when open turns false and when the dialog unmounts while open.
    return () => {
      if (dialog.open) dialog.close();
      returnTo?.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(event.currentTarget);
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser closed it on its own (for example a close watcher): keep state in sync.
        if (open) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-card border border-border bg-surface p-0 text-text backdrop:bg-obsidian/80"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-semibold">
            {title}
          </h2>
          <Button variant="ghost" className="px-3" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
            {closeLabel}
          </Button>
        </div>
        {description !== undefined && (
          <p id={descriptionId} className="text-sm text-muted">
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
```

Create `src/ui/confirm-dialog.tsx`:

```tsx
"use client";

import { Button } from "./button";
import { Dialog } from "./dialog";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** Default "Cancel". */
  readonly cancelLabel?: string;
  /** Default "danger". */
  readonly tone?: "danger" | "primary";
  /** Puts the confirm Button in its loading state. */
  readonly pending?: boolean;
  /** Shown inside the dialog as a role="alert" paragraph. */
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** A Dialog with Cancel (initial focus) and a confirm button. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={body}>
      {error !== null && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" data-autofocus onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone} loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

Create `src/ui/menu.tsx`:

```tsx
"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: "danger";
}

export interface MenuButtonProps {
  /** Visible content; it stays part of the accessible name (WCAG 2.5.3 label in name). */
  readonly label: ReactNode;
  /** Visually hidden prefix of the button's name, and the menu's aria-label. */
  readonly accessibleLabel: string;
  readonly items: readonly MenuItem[];
}

/**
 * WAI-ARIA menu button. Click, Enter or Space opens and focuses the first item; ArrowDown opens
 * at the first item and ArrowUp at the last. In the menu, ArrowUp/ArrowDown/Home/End move a
 * roving focus, Enter/Space select, Escape closes and returns focus to the button, and Tab or
 * a pointerdown outside closes it.
 */
export function MenuButton({ label, accessibleLabel, items }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const menuId = useId();
  const count = items.length;

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openAt = (index: number): void => {
    setActive(index);
    setOpen(true);
  };

  const close = (focusButton: boolean): void => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const select = (item: MenuItem | undefined): void => {
    if (item === undefined) return;
    close(true);
    item.onSelect();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(count - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(count - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(items[active]);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-muted px-3 text-sm text-text hover:bg-elevated"
      >
        <span className="sr-only">{accessibleLabel} </span>
        {label}
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={accessibleLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-40 mt-2 min-w-52 rounded-control border border-border bg-elevated p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              tabIndex={-1}
              onClick={() => select(item)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm focus:bg-surface",
                item.tone === "danger" ? "text-error" : "text-text",
              )}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Create `src/ui/segmented-control.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "./cn";

export interface SegmentedControlProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}

/**
 * <fieldset><legend> + one native radio per option, styled as segments. Arrow keys work natively.
 * The checked segment is violet AND shows a Check icon, so colour is never the only signal.
 */
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-silver">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-muted p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet",
                checked ? "bg-violet text-obsidian" : "text-text hover:bg-elevated",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {checked && <Check aria-hidden="true" className="size-4" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
```

Create `src/ui/wallet-status.tsx`:

```tsx
"use client";

import type { SolanaNetwork } from "@/modules/validation";
import { truncateAddress } from "./address";
import { MenuButton } from "./menu";
import { networkLabel } from "./network-indicator";

export interface WalletStatusProps {
  readonly address: string;
  readonly network: SolanaNetwork;
  readonly onCopyAddress: () => void;
  readonly onSwitchNetwork: () => void;
  readonly onSignOut: () => void;
}

/**
 * The top bar's wallet menu. The button reads "Wallet menu AbCd…WxYz" (visible text inside the
 * name); its items are Copy address, Switch to {other network} and Sign out.
 */
export function WalletStatus({
  address,
  network,
  onCopyAddress,
  onSwitchNetwork,
  onSignOut,
}: WalletStatusProps) {
  const other: SolanaNetwork = network === "devnet" ? "mainnet-beta" : "devnet";
  return (
    <MenuButton
      label={<span className="font-mono">{truncateAddress(address)}</span>}
      accessibleLabel="Wallet menu"
      items={[
        { id: "copy", label: "Copy address", onSelect: onCopyAddress },
        { id: "switch", label: `Switch to ${networkLabel(other)}`, onSelect: onSwitchNetwork },
        { id: "sign-out", label: "Sign out", onSelect: onSignOut, tone: "danger" },
      ]}
    />
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bunx vitest run --project ui tests/ui/ui/dialog.test.tsx tests/ui/ui/confirm-dialog.test.tsx tests/ui/ui/menu.test.tsx tests/ui/ui/segmented-control.test.tsx`
Expected: PASS, `Tests  24 passed`.
What would make it fail: relying on the browser for Escape or focus (happy-dom does neither), not restoring focus in the effect cleanup, or putting `aria-label` on the menu button (the name would no longer contain the visible address; axe flags `label-content-name-mismatch` as serious in Task 18).

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  1105 passed (1105)`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dialog.tsx src/ui/confirm-dialog.tsx src/ui/menu.tsx src/ui/segmented-control.tsx src/ui/wallet-status.tsx tests/ui/ui/dialog.test.tsx tests/ui/ui/confirm-dialog.test.tsx tests/ui/ui/menu.test.tsx tests/ui/ui/segmented-control.test.tsx
git commit -m "feat(ui): add accessible dialog, confirm dialog, menu button and segmented control" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 13: The connect-wallet modal (sign-in and link modes)

Spec §5.2, architecture §3.3, §3.4 (copy table with D4 link wording), §7.2 (429 countdown) and §7.6. Includes `panel-copy.ts`, whose constants the modal copy reuses (Task 14's panels use it too).

**Files:**
- Create: `src/components/panel-copy.ts`, `src/components/connect-wallet-copy.ts`, `src/components/use-countdown.ts`, `src/components/use-fresh-navigation.ts`, `src/components/wallet-list.tsx`, `src/components/account-picker.tsx`, `src/components/flow-status.tsx`, `src/components/connect-wallet-modal.tsx`, `src/components/connect-button.tsx`
- Test: `tests/unit/components/connect-wallet-copy.test.ts`, `tests/unit/components/panel-copy.test.ts`, `tests/ui/components/connect-wallet-modal.test.tsx`

**Interfaces:**
- Consumes: from `@/modules/wallet-connect`: `useConnectFlow`, `useWallets`, `refreshWallets`, `isInFlight`, types `FlowApi`, `FlowMode`, `FlowState`, `FlowFailureCode`, `WalletEntry`, `AccountOption`, `ApiFailure`; from `@/ui`: `Dialog`, `SegmentedControl`, `Button`, `Address`, `Spinner`, `networkLabel`; `useRouter` from `next/navigation`; `dynamic` from `next/dynamic`; helpers `mockApi`, `json`, `challengeFor`, `createFakeWallet`, `routerMock`.
- Produces:
  - `panel-copy.ts`: `UNREACHABLE`, `GENERIC`, `LAST_WALLET_COPY` strings and `panelErrorCopy(failure: ApiFailure): string`.
  - `connect-wallet-copy.ts`: `type FlowAction = "retry" | "reconnect" | "start-again" | "close"`, `interface FlowCopy { message; tone: "info" | "success" | "error"; action: FlowAction | null }`, `ACTION_LABELS`, `MAINNET_NOTE`, `NO_WALLET_SIGN_IN`, `flowCopy(state, { mode, walletName, secondsLeft }): FlowCopy | null`.
  - `use-countdown.ts`: `useCountdown(until: number | null): number`; `use-fresh-navigation.ts`: `type AppPath = "/" | "/dashboard" | "/settings/wallets" | "/settings/sessions"`, `useFreshNavigation(): (path: AppPath) => void` (`router.replace(path)` then `router.refresh()`).
  - `WalletList({ wallets, disabled, onPick })`, `AccountPicker({ accounts, onChoose })`, `FlowStatus({ state, mode, walletName, onAction })` (a focusable polite region that takes focus when an attempt starts, so focus never falls out of the dialog; a new action button takes focus).
  - `interface ConnectWalletModalProps { open; onClose; mode; initialNetwork?; api? }`, `ConnectWalletModal` (title "Connect a wallet" / "Link another wallet"; parents mount it only while open; closing cancels the attempt; sign-in `done` → `navigate("/dashboard")` + `onClose()`; link `done` → "Wallet linked." + `router.refresh()` + focused Close).
  - `interface ConnectButtonProps { children; variant?; mode?; initialNetwork? }`, `ConnectButton` (loads the modal with `next/dynamic(..., { ssr: false })` on first open).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/components/panel-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GENERIC, UNREACHABLE, panelErrorCopy } from "@/components/panel-copy";

const failure = (code: string) => ({ ok: false as const, code, message: "server text" });

describe("panelErrorCopy", () => {
  it.each([
    ["LAST_WALLET", "You can't unlink your only wallet."],
    ["DEPENDENCY_UNAVAILABLE", UNREACHABLE],
    ["NETWORK", UNREACHABLE],
    ["NOT_FOUND", GENERIC],
    ["INTERNAL", GENERIC],
    ["UNEXPECTED_RESPONSE", GENERIC],
    ["UNAUTHENTICATED", GENERIC],
  ])("%s → %s", (code, copy) => {
    expect(panelErrorCopy(failure(code))).toBe(copy);
  });

  it("uses the exact spec strings and never the server message or code", () => {
    expect(UNREACHABLE).toBe(
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
    );
    expect(GENERIC).toBe("Something went wrong. Try again.");
    expect(panelErrorCopy(failure("INTERNAL"))).not.toContain("server text");
    expect(panelErrorCopy(failure("INTERNAL"))).not.toContain("INTERNAL");
  });
});
```

Create `tests/unit/components/connect-wallet-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  MAINNET_NOTE,
  NO_WALLET_SIGN_IN,
  flowCopy,
  type FlowCopy,
} from "@/components/connect-wallet-copy";
import type { FlowFailureCode, FlowState } from "@/modules/wallet-connect";

const A = { attemptId: 1 } as const;
const PREVIEW = { domain: "localhost:3000", address: "Addr1", network: "devnet" } as const;
const failed = (code: FlowFailureCode): FlowState => ({
  ...A,
  status: "failed",
  code,
  message: "m",
});

/** [label, state, sign-in copy, link copy] — architecture §3.4, exact strings. */
const ROWS: readonly [string, FlowState, FlowCopy, FlowCopy][] = [
  [
    "connecting",
    { ...A, status: "connecting", walletName: "Phantom" },
    { message: "Connecting to Phantom…", tone: "info", action: null },
    { message: "Connecting to Phantom…", tone: "info", action: null },
  ],
  [
    "challenging",
    { ...A, status: "challenging", address: "Addr1" },
    { message: "Preparing your sign-in…", tone: "info", action: null },
    { message: "Preparing your request…", tone: "info", action: null },
  ],
  [
    "awaiting-signature",
    { ...A, status: "awaiting-signature", preview: PREVIEW },
    { message: "Approve the sign-in request in your wallet.", tone: "info", action: null },
    { message: "Approve the link request in your wallet.", tone: "info", action: null },
  ],
  [
    "verifying",
    { ...A, status: "verifying", address: "Addr1" },
    { message: "Verifying…", tone: "info", action: null },
    { message: "Verifying…", tone: "info", action: null },
  ],
  [
    "done",
    { ...A, status: "done", address: "Addr1", network: "devnet" },
    { message: "Your wallet is connected.", tone: "success", action: null },
    { message: "Wallet linked.", tone: "success", action: "close" },
  ],
  [
    "rejected",
    { ...A, status: "rejected" },
    { message: "You cancelled the sign-in.", tone: "error", action: "retry" },
    { message: "You cancelled the request.", tone: "error", action: "retry" },
  ],
  [
    "disconnected",
    { ...A, status: "disconnected" },
    { message: "Your wallet disconnected.", tone: "error", action: "reconnect" },
    { message: "Your wallet disconnected.", tone: "error", action: "reconnect" },
  ],
  [
    "account-changed",
    { ...A, status: "account-changed" },
    {
      message: "Your wallet switched accounts. Start again with the new account.",
      tone: "error",
      action: "start-again",
    },
    {
      message: "Your wallet switched accounts. Start again with the new account.",
      tone: "error",
      action: "start-again",
    },
  ],
  [
    "failed AUTH_FAILED",
    failed("AUTH_FAILED"),
    {
      message: "We couldn't verify that signature. Request a new sign-in.",
      tone: "error",
      action: "retry",
    },
    { message: "We couldn't verify that signature. Try again.", tone: "error", action: "retry" },
  ],
  [
    "failed WALLET_ALREADY_LINKED",
    failed("WALLET_ALREADY_LINKED"),
    {
      message: "That wallet is linked to another GHOST WIRE account.",
      tone: "error",
      action: "retry",
    },
    {
      message: "That wallet is linked to another GHOST WIRE account.",
      tone: "error",
      action: "retry",
    },
  ],
  [
    "failed NETWORK_UNSUPPORTED",
    failed("NETWORK_UNSUPPORTED"),
    { message: "That network isn't available right now.", tone: "error", action: "retry" },
    { message: "That network isn't available right now.", tone: "error", action: "retry" },
  ],
  [
    "failed UNREACHABLE",
    failed("UNREACHABLE"),
    {
      message: "We can't reach GHOST WIRE right now. Check your connection and try again.",
      tone: "error",
      action: "retry",
    },
    {
      message: "We can't reach GHOST WIRE right now. Check your connection and try again.",
      tone: "error",
      action: "retry",
    },
  ],
  [
    "failed OTHER",
    failed("OTHER"),
    { message: "Something went wrong. Try again.", tone: "error", action: "retry" },
    { message: "Something went wrong. Try again.", tone: "error", action: "retry" },
  ],
];

describe("flowCopy", () => {
  it.each(ROWS)("%s", (_label, state, signIn, link) => {
    expect(flowCopy(state, { mode: "sign-in", walletName: "Phantom", secondsLeft: 0 })).toEqual(
      signIn,
    );
    expect(flowCopy(state, { mode: "link", walletName: "Phantom", secondsLeft: 0 })).toEqual(link);
  });

  it("counts down while rate-limited and invites a retry at 0", () => {
    const state: FlowState = { ...A, status: "rate-limited", retryAt: 0 };
    for (const mode of ["sign-in", "link"] as const) {
      expect(flowCopy(state, { mode, walletName: "W", secondsLeft: 42 })).toEqual({
        message: "Too many attempts. Try again in 42s.",
        tone: "error",
        action: "retry",
      });
      expect(flowCopy(state, { mode, walletName: "W", secondsLeft: 0 })?.message).toBe(
        "You can try again now.",
      );
    }
  });

  it("returns null for idle and choosing-account", () => {
    const context = { mode: "sign-in", walletName: "W", secondsLeft: 0 } as const;
    expect(flowCopy({ ...A, status: "idle" }, context)).toBeNull();
    expect(
      flowCopy({ ...A, status: "choosing-account", walletName: "W", accounts: [] }, context),
    ).toBeNull();
  });

  it("never claims anonymity, untraceability or initialized privacy", () => {
    const texts = [
      MAINNET_NOTE,
      NO_WALLET_SIGN_IN,
      ...Object.values(ACTION_LABELS),
      ...ROWS.flatMap(([, , signIn, link]) => [signIn.message, link.message]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/anonym|untrace|private now|privacy (is )?(on|enabled|ready)/i);
    }
  });

  it("keeps the exact mainnet note and disabled-wallet copy", () => {
    expect(MAINNET_NOTE).toBe(
      "Private payments aren't available on mainnet yet. Signing in only links your wallet.",
    );
    expect(NO_WALLET_SIGN_IN).toBe("This wallet can't sign in to GHOST WIRE.");
  });
});
```

Create `tests/ui/components/connect-wallet-modal.test.tsx`:

```tsx
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAINNET_NOTE, NO_WALLET_SIGN_IN } from "@/components/connect-wallet-copy";
import { ConnectWalletModal } from "@/components/connect-wallet-modal";
import type { SolanaNetwork } from "@/modules/validation";
import {
  challengeFor,
  json,
  mockApi,
  type ApiRouteKey,
  type FakeApi,
  type FakeHandler,
} from "../../helpers/fake-api";
import {
  createFakeWallet,
  type FakeWallet,
  type FakeWalletOptions,
} from "../../helpers/fake-wallet";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const ID = "a".repeat(24);
const SIGN_IN = { user: { id: ID }, wallet: { id: ID, address: "x", network: "devnet" } };
const WALLET = {
  id: ID,
  address: "x",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: "2026-11-13T10:00:00.000Z",
};
const never = () => new Promise<Response>(() => undefined);

const cleanups: (() => void)[] = [];
let api: FakeApi | null = null;
const challenges: string[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  api?.restore();
  api = null;
  challenges.length = 0;
  vi.useRealTimers();
});

function wallet(options: FakeWalletOptions = {}): FakeWallet {
  const fake = createFakeWallet({ name: "Fake Wallet", ...options });
  cleanups.push(fake.register());
  return fake;
}

const issue =
  (purpose: "signin" | "link"): FakeHandler =>
  async (request) => {
    const { address, network } = (await request.json()) as {
      address: string;
      network: SolanaNetwork;
    };
    const challenge = challengeFor({ address, network, purpose });
    challenges.push(challenge.message);
    return json(200, challenge);
  };

function server(overrides: Partial<Record<ApiRouteKey, FakeHandler>> = {}): FakeApi {
  api = mockApi({
    "POST /api/v1/auth/challenge": issue("signin"),
    "POST /api/v1/auth/verify": () => json(200, SIGN_IN),
    "POST /api/v1/wallets/link/challenge": issue("link"),
    "POST /api/v1/wallets/link/verify": () => json(201, { wallet: WALLET }),
    ...overrides,
  });
  return api;
}

function Harness({
  mode = "sign-in",
  initialNetwork,
}: {
  mode?: "sign-in" | "link";
  initialNetwork?: SolanaNetwork;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      {open && (
        <ConnectWalletModal
          open
          mode={mode}
          initialNetwork={initialNetwork}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function setup(props: Parameters<typeof Harness>[0] = {}, user = userEvent.setup()) {
  render(<Harness {...props} />);
  return user;
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const paths = () => (api?.requests ?? []).map((r) => `${r.method} ${new URL(r.url).pathname}`);

describe("network selection", () => {
  it("defaults to Devnet and shows the mainnet note only for Mainnet-beta", async () => {
    wallet();
    server();
    const user = setup();
    expect(screen.getByRole("dialog", { name: "Connect a wallet" })).toBeTruthy();
    expect(radio("Devnet").checked).toBe(true);
    expect(screen.queryByText(MAINNET_NOTE)).toBeNull();
    await user.click(radio("Mainnet-beta"));
    expect(screen.getByText(MAINNET_NOTE)).toBeTruthy();
  });

  it("preselects initialNetwork", () => {
    wallet();
    server();
    setup({ initialNetwork: "mainnet-beta" });
    expect(radio("Mainnet-beta").checked).toBe(true);
    expect(screen.getByText(MAINNET_NOTE)).toBeTruthy();
  });

  it("disables the network choice while an attempt is in flight", async () => {
    wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    const group = screen.getByRole("group", { name: "Network" }) as HTMLFieldSetElement;
    expect(group.disabled).toBe(true);
  });
});

describe("wallet list", () => {
  it("shows install links and Refresh when no wallet is found", async () => {
    server();
    const user = setup();
    expect(screen.getByText("No Solana wallet found in this browser.")).toBeTruthy();
    for (const name of ["Get Phantom", "Get Solflare"]) {
      const link = screen.getByRole("link", { name: `${name} (opens in a new tab)` });
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("target")).toBe("_blank");
    }
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByText("No Solana wallet found in this browser.")).toBeTruthy();
    // A wallet that injects late (mobile in-app browsers) appears without a reload.
    act(() => {
      cleanups.push(createFakeWallet({ name: "Arrived" }).register());
    });
    expect(screen.getByRole("button", { name: "Arrived" })).toBeTruthy();
  });

  it("disables a wallet without signMessage and explains why", () => {
    wallet({ name: "No Sign", mode: "no-signMessage" });
    server();
    setup();
    const button = screen.getByRole("button", { name: "No Sign" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const note = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe(NO_WALLET_SIGN_IN);
  });
});

describe("status copy for every state", () => {
  it("connecting", async () => {
    const base = createFakeWallet({ name: "Slow" });
    const slow: Wallet = {
      ...base.wallet,
      accounts: base.wallet.accounts,
      features: {
        ...base.wallet.features,
        "standard:connect": { version: "1.0.0", connect: () => new Promise(() => undefined) },
      },
    };
    cleanups.push(getWallets().register(slow));
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Slow" }));
    expect(await screen.findByText("Connecting to Slow…")).toBeTruthy();
  });

  it("challenging", async () => {
    wallet();
    server({ "POST /api/v1/auth/challenge": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Preparing your sign-in…")).toBeTruthy();
  });

  it("awaiting-signature shows the preview: domain, truncated address, network", async () => {
    const fake = wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    const preview = screen.getByText("Domain").closest("dl") as HTMLElement;
    const address = fake.keys[0]?.address ?? "";
    expect(within(preview).getByText("localhost:3000")).toBeTruthy();
    expect(within(preview).getByText(`${address.slice(0, 4)}…${address.slice(-4)}`)).toBeTruthy();
    expect(within(preview).getByText("Devnet")).toBeTruthy();
  });

  it("verifying", async () => {
    wallet();
    server({ "POST /api/v1/auth/verify": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Verifying…")).toBeTruthy();
  });

  it("done (sign-in) navigates to /dashboard, refreshes and closes", async () => {
    wallet();
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    expect(routerMock.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(paths()).toEqual(["POST /api/v1/auth/challenge", "POST /api/v1/auth/verify"]);
  });

  it("done (link) shows Wallet linked., refreshes and focuses Close", async () => {
    wallet();
    server();
    const user = setup({ mode: "link" });
    expect(screen.getByRole("dialog", { name: "Link another wallet" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect(await screen.findByText("Wallet linked.")).toBeTruthy();
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    const close = screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement;
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(paths()).toEqual([
      "POST /api/v1/wallets/link/challenge",
      "POST /api/v1/wallets/link/verify",
    ]);
  });

  it("rejected → Try again requests a new challenge and succeeds", async () => {
    const fake = wallet({ mode: "reject" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You cancelled the sign-in.");
    fake.setMode("approve");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    expect(paths().filter((p) => p === "POST /api/v1/auth/challenge")).toHaveLength(2);
  });

  it("disconnected → Reconnect", async () => {
    const fake = wallet({ mode: "disconnect" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Your wallet disconnected.");
    fake.setMode("approve");
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("account-changed → Start again", async () => {
    const fake = wallet({ mode: "switch-account" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Your wallet switched accounts. Start again with the new account.",
    );
    fake.setMode("hang");
    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByText("Approve the sign-in request in your wallet.")).toBeTruthy();
    expect(paths().filter((p) => p === "POST /api/v1/auth/challenge")).toHaveLength(2);
  });

  it.each<[string, Partial<Record<ApiRouteKey, FakeHandler>>, string, string]>([
    [
      "AUTH_FAILED",
      {
        "POST /api/v1/auth/verify": () =>
          json(401, { code: "AUTH_FAILED", message: "Authentication failed" }),
      },
      "We couldn't verify that signature. Request a new sign-in.",
      "AUTH_FAILED",
    ],
    [
      "WALLET_ALREADY_LINKED",
      {
        "POST /api/v1/auth/verify": () =>
          json(409, { code: "WALLET_ALREADY_LINKED", message: "Conflict" }),
      },
      "That wallet is linked to another GHOST WIRE account.",
      "WALLET_ALREADY_LINKED",
    ],
    [
      "NETWORK_UNSUPPORTED",
      {
        "POST /api/v1/auth/challenge": () =>
          json(400, { code: "NETWORK_UNSUPPORTED", message: "Invalid request" }),
      },
      "That network isn't available right now.",
      "NETWORK_UNSUPPORTED",
    ],
    [
      "DEPENDENCY_UNAVAILABLE",
      {
        "POST /api/v1/auth/challenge": () =>
          json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "Service temporarily unavailable" }),
      },
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
      "DEPENDENCY_UNAVAILABLE",
    ],
    [
      "NETWORK (fetch rejects)",
      { "POST /api/v1/auth/challenge": () => Promise.reject(new TypeError("Failed to fetch")) },
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
      "NETWORK",
    ],
    [
      "INTERNAL",
      {
        "POST /api/v1/auth/verify": () =>
          json(500, { code: "INTERNAL", message: "Internal error" }),
      },
      "Something went wrong. Try again.",
      "INTERNAL",
    ],
  ])(
    "failed %s shows its copy, a retry, and no raw code",
    async (_label, overrides, copy, code) => {
      wallet();
      server(overrides);
      const user = setup();
      await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
      expect((await screen.findByRole("alert")).textContent).toBe(copy);
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      expect(document.body.textContent).not.toContain(code);
    },
  );
});

describe("rate limiting", () => {
  it("counts down from Retry-After and enables the retry at 0", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    wallet();
    server({
      "POST /api/v1/auth/challenge": () =>
        json(429, { code: "RATE_LIMITED", message: "Too many requests" }, { "Retry-After": "3" }),
    });
    const user = setup({}, userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many attempts. Try again in 3s.",
    );
    const retry = screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Try again in 2s.");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("alert").textContent).toBe("You can try again now.");
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("closing and accounts", () => {
  it("closing aborts the attempt; nothing happens afterwards and reopening starts idle", async () => {
    const fake = wallet({ mode: "hang" });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Approve the sign-in request in your wallet.");
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    fake.setMode("approve");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fake.calls.signMessage).toBe(1);
    expect(paths()).not.toContain("POST /api/v1/auth/verify");
    expect(routerMock.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("button", { name: "Fake Wallet" })).toBeTruthy();
    expect(screen.queryByText("Approve the sign-in request in your wallet.")).toBeNull();
  });

  it("asks which account to use when the wallet has several, and signs with that key", async () => {
    const fake = wallet({ accountCount: 2 });
    server();
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    const group = await screen.findByRole("group", { name: "Choose an account" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(2);
    const second = fake.keys[1]?.address ?? "";
    expect(group.textContent).toContain(`${second.slice(0, 4)}…${second.slice(-4)}`);
    await user.click(options[1] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/dashboard"));
    const verify = api?.requests.find((r) => new URL(r.url).pathname === "/api/v1/auth/verify");
    const body = (await verify?.json()) as { signature: string };
    expect(body.signature).toBe(fake.keys[1]?.sign(challenges[0] ?? ""));
  });

  it("skips the picker for a single account", async () => {
    wallet();
    server({ "POST /api/v1/auth/verify": never });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Fake Wallet" }));
    await screen.findByText("Verifying…");
    expect(screen.queryByRole("group", { name: "Choose an account" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project unit tests/unit/components; bunx vitest run --project ui tests/ui/components/connect-wallet-modal.test.tsx`
Expected: FAIL, each file with `Failed to resolve import "@/components/…"`.

- [ ] **Step 3: Implement the copy and hooks**

Create `src/components/panel-copy.ts`:

```ts
import type { ApiFailure } from "@/modules/wallet-connect";

export const UNREACHABLE =
  "We can't reach GHOST WIRE right now. Check your connection and try again.";
export const GENERIC = "Something went wrong. Try again.";
export const LAST_WALLET_COPY = "You can't unlink your only wallet.";

/** User-facing copy for a failed panel action. Raw codes are never shown. */
export function panelErrorCopy(failure: ApiFailure): string {
  switch (failure.code) {
    case "LAST_WALLET":
      return LAST_WALLET_COPY;
    case "DEPENDENCY_UNAVAILABLE":
    case "NETWORK":
      return UNREACHABLE;
    default:
      return GENERIC;
  }
}
```

Create `src/components/connect-wallet-copy.ts`:

```ts
import type { FlowFailureCode, FlowMode, FlowState } from "@/modules/wallet-connect";
import { GENERIC, UNREACHABLE } from "./panel-copy";

export type FlowAction = "retry" | "reconnect" | "start-again" | "close";

export interface FlowCopy {
  readonly message: string;
  readonly tone: "info" | "success" | "error";
  readonly action: FlowAction | null;
}

export const MAINNET_NOTE =
  "Private payments aren't available on mainnet yet. Signing in only links your wallet.";
export const NO_WALLET_SIGN_IN = "This wallet can't sign in to GHOST WIRE.";

export const ACTION_LABELS: Readonly<Record<FlowAction, string>> = {
  retry: "Try again",
  reconnect: "Reconnect",
  "start-again": "Start again",
  close: "Close",
};

function failureMessage(code: FlowFailureCode, link: boolean): string {
  switch (code) {
    case "AUTH_FAILED":
      return link
        ? "We couldn't verify that signature. Try again."
        : "We couldn't verify that signature. Request a new sign-in.";
    case "WALLET_ALREADY_LINKED":
      return "That wallet is linked to another GHOST WIRE account.";
    case "NETWORK_UNSUPPORTED":
      return "That network isn't available right now.";
    case "UNREACHABLE":
      return UNREACHABLE;
    case "OTHER":
      return GENERIC;
  }
}

const info = (message: string): FlowCopy => ({ message, tone: "info", action: null });
const error = (message: string, action: FlowAction): FlowCopy => ({
  message,
  tone: "error",
  action,
});

/**
 * The modal's status copy (spec §5.2, architecture §3.4 with the link-mode wording). null for
 * idle and choosing-account. Never mentions privacy being set up, and never shows a raw code.
 */
export function flowCopy(
  state: FlowState,
  context: { readonly mode: FlowMode; readonly walletName: string; readonly secondsLeft: number },
): FlowCopy | null {
  const link = context.mode === "link";
  switch (state.status) {
    case "idle":
    case "choosing-account":
      return null;
    case "connecting":
      return info(`Connecting to ${context.walletName}…`);
    case "challenging":
      return info(link ? "Preparing your request…" : "Preparing your sign-in…");
    case "awaiting-signature":
      return info(
        link
          ? "Approve the link request in your wallet."
          : "Approve the sign-in request in your wallet.",
      );
    case "verifying":
      return info("Verifying…");
    case "done":
      return link
        ? { message: "Wallet linked.", tone: "success", action: "close" }
        : { message: "Your wallet is connected.", tone: "success", action: null };
    case "rejected":
      return error(link ? "You cancelled the request." : "You cancelled the sign-in.", "retry");
    case "disconnected":
      return error("Your wallet disconnected.", "reconnect");
    case "account-changed":
      return error(
        "Your wallet switched accounts. Start again with the new account.",
        "start-again",
      );
    case "rate-limited":
      return error(
        context.secondsLeft > 0
          ? `Too many attempts. Try again in ${context.secondsLeft}s.`
          : "You can try again now.",
        "retry",
      );
    case "failed":
      return error(failureMessage(state.code, link), "retry");
  }
}
```

Create `src/components/use-countdown.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

function secondsUntil(until: number | null): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/** Whole seconds until `until` (epoch ms), never below 0; ticks every second; null → 0. */
export function useCountdown(until: number | null): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(until));
  const [tracked, setTracked] = useState(until);
  if (tracked !== until) {
    // A new deadline: recompute during render instead of waiting for the next tick.
    setTracked(until);
    setSeconds(secondsUntil(until));
  }
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setSeconds(secondsUntil(until)), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return seconds;
}
```

Create `src/components/use-fresh-navigation.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** The fixed in-app routes. Never put an address, token or id in a navigation. */
export type AppPath = "/" | "/dashboard" | "/settings/wallets" | "/settings/sessions";

/**
 * router.replace(path) then router.refresh(): replace fetches the new page (dynamic stale time
 * is 0), and refresh re-renders shared layouts such as the (app) shell's network indicator.
 */
export function useFreshNavigation(): (path: AppPath) => void {
  const router = useRouter();
  return useCallback(
    (path: AppPath) => {
      router.replace(path);
      router.refresh();
    },
    [router],
  );
}
```

- [ ] **Step 4: Implement the modal parts**

Create `src/components/wallet-list.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { useId } from "react";
import { refreshWallets, type WalletEntry } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
import { NO_WALLET_SIGN_IN } from "./connect-wallet-copy";

const INSTALL_LINKS = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
] as const;

/** The modal's wallet buttons, or install links and Refresh when no Solana wallet is found. */
export function WalletList({
  wallets,
  disabled,
  onPick,
}: {
  readonly wallets: readonly WalletEntry[];
  readonly disabled: boolean;
  readonly onPick: (entry: WalletEntry) => void;
}) {
  const noteId = useId();
  if (wallets.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">No Solana wallet found in this browser.</p>
        <ul className="flex flex-col gap-2">
          {INSTALL_LINKS.map((link) => (
            <li key={link.name}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm text-violet underline underline-offset-4"
              >
                Get {link.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={refreshWallets}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Wallets">
      {wallets.map((entry) => {
        const descriptionId = `${noteId}-${entry.id}`;
        return (
          <li key={entry.id} className="flex flex-col gap-1">
            <button
              type="button"
              disabled={disabled || !entry.canSignIn}
              aria-describedby={entry.canSignIn ? undefined : descriptionId}
              onClick={() => onPick(entry)}
              className="flex min-h-11 w-full items-center gap-3 rounded-control border border-muted px-3 text-left text-sm font-medium text-text hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs */}
              <img src={entry.icon} alt="" width={24} height={24} className="size-6" />
              {entry.name}
            </button>
            {!entry.canSignIn && (
              <p id={descriptionId} className="text-xs text-muted">
                {NO_WALLET_SIGN_IN}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

Create `src/components/account-picker.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import type { AccountOption } from "@/modules/wallet-connect";
import { Address } from "@/ui/address";
import { Button } from "@/ui/button";

/** Shown only when the wallet connected more than one account. */
export function AccountPicker({
  accounts,
  onChoose,
}: {
  readonly accounts: readonly AccountOption[];
  readonly onChoose: (address: string) => void;
}) {
  const [selected, setSelected] = useState(accounts[0]?.address ?? "");
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onChoose(selected);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-silver">Choose an account</legend>
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <label
              key={account.address}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-muted px-3 text-sm"
            >
              <input
                type="radio"
                name="account"
                value={account.address}
                checked={selected === account.address}
                onChange={() => setSelected(account.address)}
                className="size-4 accent-violet"
              />
              <span className="flex flex-col">
                {account.label !== null && <span>{account.label}</span>}
                <Address value={account.address} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit">Continue</Button>
    </form>
  );
}
```

Create `src/components/flow-status.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { isInFlight, type FlowMode, type FlowState } from "@/modules/wallet-connect";
import { Address } from "@/ui/address";
import { Button } from "@/ui/button";
import { networkLabel } from "@/ui/network-indicator";
import { Spinner } from "@/ui/spinner";
import { ACTION_LABELS, flowCopy, type FlowAction } from "./connect-wallet-copy";
import { useCountdown } from "./use-countdown";

/**
 * The modal's polite status region: the §5.2 copy (a spinner while in flight, a role="alert"
 * paragraph for failures), the signing preview, and the action button. The 429 retry stays
 * disabled until the countdown reaches 0. Focus never falls out of the dialog: when an attempt
 * starts (the wallet list hides) the region itself takes focus, and a newly shown action button
 * takes focus.
 */
export function FlowStatus({
  state,
  mode,
  walletName,
  onAction,
}: {
  readonly state: FlowState;
  readonly mode: FlowMode;
  readonly walletName: string;
  readonly onAction: (action: FlowAction) => void;
}) {
  const secondsLeft = useCountdown(state.status === "rate-limited" ? state.retryAt : null);
  const copy = flowCopy(state, { mode, walletName, secondsLeft });
  const messageId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const action = copy?.action ?? null;
  const inFlight = isInFlight(state);

  useEffect(() => {
    if (inFlight) regionRef.current?.focus();
  }, [inFlight, state.attemptId]);

  useEffect(() => {
    if (action !== null) actionRef.current?.focus();
  }, [action, state.attemptId]);

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-control"
    >
      {copy !== null &&
        (copy.tone === "error" ? (
          <p role="alert" id={messageId} className="text-sm text-error">
            {copy.message}
          </p>
        ) : inFlight ? (
          <Spinner label={copy.message} />
        ) : (
          <p id={messageId} className="text-sm text-success">
            {copy.message}
          </p>
        ))}
      {state.status === "awaiting-signature" && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-control border border-border p-3 text-sm">
          <dt className="text-muted">Domain</dt>
          <dd>{state.preview.domain}</dd>
          <dt className="text-muted">Account</dt>
          <dd>
            <Address value={state.preview.address} />
          </dd>
          <dt className="text-muted">Network</dt>
          <dd>{networkLabel(state.preview.network)}</dd>
        </dl>
      )}
      {action !== null && (
        <Button
          ref={actionRef}
          variant={action === "close" ? "primary" : "secondary"}
          disabled={state.status === "rate-limited" && secondsLeft > 0}
          aria-describedby={messageId}
          onClick={() => onAction(action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      )}
    </div>
  );
}
```

Create `src/components/connect-wallet-modal.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import {
  isInFlight,
  useConnectFlow,
  useWallets,
  type FlowApi,
  type FlowMode,
  type WalletEntry,
} from "@/modules/wallet-connect";
import { Dialog } from "@/ui/dialog";
import { SegmentedControl } from "@/ui/segmented-control";
import { AccountPicker } from "./account-picker";
import { MAINNET_NOTE, type FlowAction } from "./connect-wallet-copy";
import { FlowStatus } from "./flow-status";
import { useFreshNavigation } from "./use-fresh-navigation";
import { WalletList } from "./wallet-list";

export interface ConnectWalletModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mode: FlowMode;
  /** Default "devnet". */
  readonly initialNetwork?: SolanaNetwork;
  /** Tests may inject; default apiClient. */
  readonly api?: FlowApi;
}

const NETWORK_OPTIONS = [
  { value: "devnet", label: "Devnet" },
  { value: "mainnet-beta", label: "Mainnet-beta" },
] as const satisfies readonly { value: SolanaNetwork; label: string }[];

/**
 * Connect-and-sign-in (or link) modal. Parents mount it only while open, so every open starts
 * idle on `initialNetwork`. Closing cancels the attempt. Sign-in success navigates to
 * /dashboard; link success shows "Wallet linked." and refreshes the server data.
 */
export function ConnectWalletModal({
  open,
  onClose,
  mode,
  initialNetwork = "devnet",
  api,
}: ConnectWalletModalProps) {
  const flow = useConnectFlow({ mode, api });
  const { state } = flow;
  const wallets = useWallets();
  const router = useRouter();
  const navigate = useFreshNavigation();
  const [network, setNetwork] = useState<SolanaNetwork>(initialNetwork);
  const [last, setLast] = useState<WalletEntry | null>(null);
  const lastAddress = useRef<string | undefined>(undefined);
  const handledDone = useRef(0);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (state.status === "challenging" || state.status === "verifying") {
      lastAddress.current = state.address;
    }
    if (state.status !== "done" || handledDone.current === state.attemptId) return;
    handledDone.current = state.attemptId;
    if (mode === "sign-in") {
      navigate("/dashboard");
      onCloseRef.current();
    } else {
      router.refresh();
    }
  }, [state, mode, navigate, router]);

  const close = (): void => {
    flow.cancel();
    onClose();
  };

  const pick = (entry: WalletEntry): void => {
    setLast(entry);
    lastAddress.current = undefined;
    flow.start(entry, network);
  };

  const onAction = (action: FlowAction): void => {
    if (action === "close") {
      close();
      return;
    }
    if (last === null) return;
    if (action === "start-again") lastAddress.current = undefined;
    flow.start(last, network, { preferredAddress: lastAddress.current });
  };

  const inFlight = isInFlight(state);
  const showList = state.status === "idle" || (!inFlight && state.status !== "done");

  return (
    <Dialog
      open={open}
      onClose={close}
      title={mode === "sign-in" ? "Connect a wallet" : "Link another wallet"}
    >
      <SegmentedControl
        legend="Network"
        name="network"
        value={network}
        options={NETWORK_OPTIONS}
        onChange={setNetwork}
        disabled={inFlight}
      />
      {network === "mainnet-beta" && <p className="text-sm text-silver">{MAINNET_NOTE}</p>}
      {showList && <WalletList wallets={wallets} disabled={inFlight} onPick={pick} />}
      {state.status === "choosing-account" && (
        <AccountPicker accounts={state.accounts} onChoose={flow.chooseAccount} />
      )}
      <FlowStatus
        state={state}
        mode={mode}
        walletName={state.status === "connecting" ? state.walletName : (last?.name ?? "")}
        onAction={onAction}
      />
    </Dialog>
  );
}
```

Create `src/components/connect-button.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import type { FlowMode } from "@/modules/wallet-connect";
import { Button, type ButtonVariant } from "@/ui/button";

/** Loaded on first open, which keeps wallet-connect, zod/mini and bs58 off the landing page's JS. */
const ConnectWalletModal = dynamic(
  () => import("./connect-wallet-modal").then((module) => module.ConnectWalletModal),
  { ssr: false },
);

export interface ConnectButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  /** Default "sign-in". */
  readonly mode?: FlowMode;
  /** Default "devnet". */
  readonly initialNetwork?: SolanaNetwork;
}

export function ConnectButton({
  children,
  variant = "primary",
  mode = "sign-in",
  initialNetwork = "devnet",
}: ConnectButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <ConnectWalletModal
          open
          mode={mode}
          initialNetwork={initialNetwork}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `bunx vitest run --project unit tests/unit/components && bunx vitest run --project ui tests/ui/components/connect-wallet-modal.test.tsx`
Expected: PASS, `25` unit and `24` ui tests.
What would make it fail: any copy string differing from architecture §3.4 (the unit table compares exact strings), a retry that reuses the old challenge (the rejected case expects two challenge requests), not focusing the status region when the wallet list hides (the close-on-Escape case asserts focus is inside the dialog), or enabling Try again before the countdown ends.

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test && bun run build`
Expected: clean; `Tests  1154 passed (1154)`; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/panel-copy.ts src/components/connect-wallet-copy.ts src/components/use-countdown.ts src/components/use-fresh-navigation.ts src/components/wallet-list.tsx src/components/account-picker.tsx src/components/flow-status.tsx src/components/connect-wallet-modal.tsx src/components/connect-button.tsx tests/unit/components/panel-copy.test.ts tests/unit/components/connect-wallet-copy.test.ts tests/ui/components/connect-wallet-modal.test.tsx
git commit -m "feat(components): add connect-wallet modal with every flow state" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 14: Wallets and sessions settings panels

Spec §5.3 (wallets and sessions pages), architecture §4.3 (actions and toasts). Client panels that receive server data as props and call the API client.

**Files:**
- Create: `src/components/wallets-panel.tsx`, `src/components/sessions-panel.tsx`
- Test: `tests/ui/components/wallets-panel.test.tsx`, `tests/ui/components/sessions-panel.test.tsx`

**Interfaces:**
- Consumes: `unlinkWallet`, `revokeSession`, types `WalletItem`, `SessionItem` (`@/modules/wallet-connect`); `Address`, `truncateAddress`, `Badge`, `Button`, `ConfirmDialog`, `DateTime`, `formatUtc`, `NetworkIndicator`, `useToast` (`@/ui`); `ConnectWalletModal`, `panelErrorCopy`, `useFreshNavigation` (Task 13).
- Produces:
  - `interface WalletsPanelProps { wallets: readonly WalletItem[]; currentWalletId: string; network: SolanaNetwork }`, `WalletsPanel`, `UNLINK_BODY`. Section heading "Wallets". Each active wallet has a button named "Unlink wallet AbCd…WxYz" (visible "Unlink"). Unlink other → toast "Wallet unlinked." + `router.refresh()`; unlink current → toast "You unlinked the wallet you signed in with, so you've been signed out." + `navigate("/")`; `LAST_WALLET` → alert in the dialog; `NOT_FOUND` → close + refresh; `UNAUTHENTICATED` → close (the session handler navigates).
  - `SessionsPanel({ sessions: readonly SessionItem[] })`. Section heading "Active sessions". Current row: "This device" badge and a "Sign out this device" button (dialog "Sign out this device?"); others: "Revoke" (dialog "Revoke this session?"). Current revoked → toast "This device was signed out." + `navigate("/")`; other → toast "Session revoked." + refresh.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/components/wallets-panel.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletsPanel } from "@/components/wallets-panel";
import type { WalletItem } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const CURRENT: WalletItem = {
  id: "a".repeat(24),
  address: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2",
  network: "devnet",
  provider: "phantom",
  status: "active",
  linkedAt: "2026-11-13T10:00:00.000Z",
};
const OTHER: WalletItem = {
  id: "b".repeat(24),
  address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  network: "devnet",
  provider: null,
  status: "active",
  linkedAt: "2026-11-12T08:30:00.000Z",
};
const GONE: WalletItem = {
  id: "c".repeat(24),
  address: "So11111111111111111111111111111111111111112",
  network: "mainnet-beta",
  provider: "solflare",
  status: "disconnected",
  linkedAt: "2026-11-01T00:00:00.000Z",
};

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(
  unlink: FakeHandler = () => noContent(),
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  api = mockApi({ "DELETE /api/v1/wallets/:id": unlink });
  render(
    <ToastProvider>
      <WalletsPanel
        wallets={[CURRENT, OTHER, GONE]}
        currentWalletId={CURRENT.id}
        network={network}
      />
    </ToastProvider>,
  );
  return userEvent.setup();
}

/** The toast provider's polite region (Address copy buttons add their own status regions). */
function toastRegion(): HTMLElement {
  const region = screen
    .getAllByRole("status")
    .find((el) => el.getAttribute("aria-live") === "polite");
  if (region === undefined) throw new Error("no toast region");
  return region;
}

function row(address: string): HTMLElement {
  return screen.getByTitle(address).closest("li") as HTMLElement;
}

async function openUnlink(user: ReturnType<typeof userEvent.setup>, wallet: WalletItem) {
  await user.click(within(row(wallet.address)).getByRole("button", { name: /^Unlink/ }));
  return screen.getByRole("dialog", { name: "Unlink this wallet?" });
}

describe("WalletsPanel", () => {
  it("renders address, network, provider, status and linked date per wallet", () => {
    setup();
    const current = row(CURRENT.address);
    expect(current.textContent).toContain("7Np4…T4K2");
    expect(current.textContent).toContain("Devnet");
    expect(current.textContent).toContain("phantom");
    expect(current.textContent).toContain("Active");
    expect(current.textContent).toContain("Nov 13, 2026, 10:00 AM UTC");
    expect(row(OTHER.address).textContent).toContain("Unknown");
    const gone = row(GONE.address);
    expect(gone.textContent).toContain("Unlinked");
    expect(gone.textContent).toContain("Mainnet-beta");
    expect(within(gone).queryByRole("button", { name: /^Unlink/ })).toBeNull();
  });

  it("opens the link modal in link mode on the session network", async () => {
    const user = setup(undefined, "mainnet-beta");
    await user.click(screen.getByRole("button", { name: "Link another wallet" }));
    const dialog = screen.getByRole("dialog", { name: "Link another wallet" });
    expect(
      (within(dialog).getByRole("radio", { name: "Mainnet-beta" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("confirms with the exact copy, unlinks another wallet, toasts and refreshes", async () => {
    const user = setup();
    const dialog = await openUnlink(user, OTHER);
    expect(dialog.textContent).toContain(
      "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `DELETE /api/v1/wallets/${OTHER.id}`,
    ]);
    expect(toastRegion().textContent).toContain("Wallet unlinked.");
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends nothing on Cancel", async () => {
    const user = setup();
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api?.requests).toHaveLength(0);
  });

  it("shows LAST_WALLET inside the dialog", async () => {
    const user = setup(() => json(409, { code: "LAST_WALLET", message: "Conflict" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You can't unlink your only wallet.",
    );
    expect(dialog.textContent).not.toContain("LAST_WALLET");
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("signs out after unlinking the current wallet", async () => {
    const user = setup();
    const dialog = await openUnlink(user, CURRENT);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(toastRegion().textContent).toContain(
      "You unlinked the wallet you signed in with, so you've been signed out.",
    );
  });

  it("closes and refreshes on NOT_FOUND", async () => {
    const user = setup(() => json(404, { code: "NOT_FOUND", message: "Not found" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the unreachable copy on a 503", async () => {
    const user = setup(() => json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "x" }));
    const dialog = await openUnlink(user, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Unlink" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "We can't reach GHOST WIRE right now. Check your connection and try again.",
    );
  });
});
```

Create `tests/ui/components/sessions-panel.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsPanel } from "@/components/sessions-panel";
import type { SessionItem } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const CURRENT: SessionItem = {
  id: "a".repeat(24),
  current: true,
  createdAt: "2026-11-13T09:00:00.000Z",
  lastSeenAt: "2026-11-13T10:00:00.000Z",
  expiresAt: "2026-11-20T10:00:00.000Z",
  network: "devnet",
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/158",
};
const OTHER: SessionItem = {
  id: "b".repeat(24),
  current: false,
  createdAt: "2026-11-12T09:00:00.000Z",
  lastSeenAt: "2026-11-12T11:15:00.000Z",
  expiresAt: "2026-11-19T11:15:00.000Z",
  network: "mainnet-beta",
  userAgent: null,
};

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(revoke: FakeHandler = () => noContent()) {
  api = mockApi({ "DELETE /api/v1/sessions/:id": revoke });
  render(
    <ToastProvider>
      <SessionsPanel sessions={[CURRENT, OTHER]} />
    </ToastProvider>,
  );
  return userEvent.setup();
}

const rows = () => screen.getAllByRole("listitem");

describe("SessionsPanel", () => {
  it("marks this device and shows network, device, last seen and expiry", () => {
    setup();
    const [current, other] = rows();
    expect(current?.textContent).toContain("This device");
    expect(current?.textContent).toContain("Devnet");
    expect(current?.textContent).toContain("Nov 13, 2026, 10:00 AM UTC");
    expect(current?.textContent).toContain("Nov 20, 2026, 10:00 AM UTC");
    expect(within(current as HTMLElement).getByTitle(CURRENT.userAgent ?? "")).toBeTruthy();
    expect(other?.textContent).not.toContain("This device");
    expect(other?.textContent).toContain("Unknown device");
    expect(other?.textContent).toContain("Mainnet-beta");
  });

  it("revokes another session after confirmation, toasts and refreshes", async () => {
    const user = setup();
    await user.click(within(rows()[1] as HTMLElement).getByRole("button", { name: /^Revoke/ }));
    const dialog = screen.getByRole("dialog", { name: "Revoke this session?" });
    expect(dialog.textContent).toContain("That device will be signed out of GHOST WIRE.");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      `DELETE /api/v1/sessions/${OTHER.id}`,
    ]);
    expect(screen.getByRole("status").textContent).toContain("Session revoked.");
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("signs out this device and returns to the start page", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    const dialog = screen.getByRole("dialog", { name: "Sign out this device?" });
    expect(dialog.textContent).toContain("You'll be signed out and returned to the start page.");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("status").textContent).toContain("This device was signed out.");
    expect(api?.requests).toHaveLength(1);
  });

  it("sends nothing on Cancel", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api?.requests).toHaveLength(0);
  });

  it("shows the generic copy for an unexpected failure", async () => {
    const user = setup(() => json(500, { code: "INTERNAL", message: "Internal error" }));
    await user.click(within(rows()[1] as HTMLElement).getByRole("button", { name: /^Revoke/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Something went wrong. Try again.",
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project ui tests/ui/components/wallets-panel.test.tsx tests/ui/components/sessions-panel.test.tsx`
Expected: FAIL, `Failed to resolve import "@/components/wallets-panel"` / `"@/components/sessions-panel"`.

- [ ] **Step 3: Implement**

Create `src/components/wallets-panel.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { unlinkWallet, type WalletItem } from "@/modules/wallet-connect";
import { Address, truncateAddress } from "@/ui/address";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DateTime } from "@/ui/date-time";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { ConnectWalletModal } from "./connect-wallet-modal";
import { panelErrorCopy } from "./panel-copy";
import { useFreshNavigation } from "./use-fresh-navigation";

export interface WalletsPanelProps {
  readonly wallets: readonly WalletItem[];
  /** The wallet the current session signed in with (server-provided). */
  readonly currentWalletId: string;
  /** The session's network; the link modal starts on it. */
  readonly network: SolanaNetwork;
}

export const UNLINK_BODY =
  "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain.";

/** /settings/wallets: list, link (modal in link mode) and unlink with confirmation. */
export function WalletsPanel({ wallets, currentWalletId, network }: WalletsPanelProps) {
  const router = useRouter();
  const navigate = useFreshNavigation();
  const toast = useToast();
  const [linking, setLinking] = useState(false);
  const [target, setTarget] = useState<WalletItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeConfirm = (): void => {
    setTarget(null);
    setPending(false);
    setError(null);
  };

  const confirmUnlink = async (): Promise<void> => {
    if (target === null) return;
    setPending(true);
    setError(null);
    const result = await unlinkWallet(target.id);
    if (result.ok) {
      closeConfirm();
      if (target.id === currentWalletId) {
        // The server revoked this session and cleared the cookie.
        toast.show({
          message: "You unlinked the wallet you signed in with, so you've been signed out.",
        });
        navigate("/");
      } else {
        toast.show({ message: "Wallet unlinked.", tone: "success" });
        router.refresh();
      }
      return;
    }
    if (result.code === "NOT_FOUND") {
      closeConfirm();
      router.refresh();
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      // SessionExpiredHandler shows the toast and navigates.
      closeConfirm();
      return;
    }
    setPending(false);
    setError(panelErrorCopy(result));
  };

  return (
    <section aria-labelledby="wallets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="wallets-heading" className="font-heading text-xl font-semibold">
          Wallets
        </h2>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Link another wallet
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {wallets.map((wallet) => (
          <li
            key={wallet.id}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Address</dt>
              <dd className="min-w-0">
                <Address value={wallet.address} copyable />
              </dd>
              <dt className="text-muted">Network</dt>
              <dd>
                <NetworkIndicator network={wallet.network} />
              </dd>
              <dt className="text-muted">Provider</dt>
              <dd>{wallet.provider ?? "Unknown"}</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                {wallet.status === "active" ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="neutral">Unlinked</Badge>
                )}
              </dd>
              <dt className="text-muted">Linked</dt>
              <dd>
                <DateTime iso={wallet.linkedAt} />
              </dd>
            </dl>
            {wallet.status === "active" && (
              <div>
                <Button variant="secondary" onClick={() => setTarget(wallet)}>
                  Unlink
                  <span className="sr-only"> wallet {truncateAddress(wallet.address)}</span>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {linking && (
        <ConnectWalletModal
          open
          mode="link"
          initialNetwork={network}
          onClose={() => setLinking(false)}
        />
      )}
      <ConfirmDialog
        open={target !== null}
        title="Unlink this wallet?"
        body={UNLINK_BODY}
        confirmLabel="Unlink"
        pending={pending}
        error={error}
        onConfirm={() => void confirmUnlink()}
        onCancel={closeConfirm}
      />
    </section>
  );
}
```

Create `src/components/sessions-panel.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeSession, type SessionItem } from "@/modules/wallet-connect";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { DateTime, formatUtc } from "@/ui/date-time";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { panelErrorCopy } from "./panel-copy";
import { useFreshNavigation } from "./use-fresh-navigation";

const OTHER_COPY = {
  title: "Revoke this session?",
  body: "That device will be signed out of GHOST WIRE.",
  confirmLabel: "Revoke",
} as const;
const CURRENT_COPY = {
  title: "Sign out this device?",
  body: "You'll be signed out and returned to the start page.",
  confirmLabel: "Sign out",
} as const;

/** /settings/sessions: active sessions, "This device" marker, revoke with confirmation. */
export function SessionsPanel({ sessions }: { readonly sessions: readonly SessionItem[] }) {
  const router = useRouter();
  const navigate = useFreshNavigation();
  const toast = useToast();
  const [target, setTarget] = useState<SessionItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeConfirm = (): void => {
    setTarget(null);
    setPending(false);
    setError(null);
  };

  const confirmRevoke = async (): Promise<void> => {
    if (target === null) return;
    setPending(true);
    setError(null);
    const result = await revokeSession(target.id);
    if (result.ok) {
      closeConfirm();
      if (target.current) {
        toast.show({ message: "This device was signed out." });
        navigate("/");
      } else {
        toast.show({ message: "Session revoked.", tone: "success" });
        router.refresh();
      }
      return;
    }
    if (result.code === "NOT_FOUND") {
      closeConfirm();
      router.refresh();
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      closeConfirm();
      return;
    }
    setPending(false);
    setError(panelErrorCopy(result));
  };

  const copy = target?.current === true ? CURRENT_COPY : OTHER_COPY;

  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
      <h2 id="sessions-heading" className="font-heading text-xl font-semibold">
        Active sessions
      </h2>
      <ul className="flex flex-col gap-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            {session.current && (
              <div>
                <Badge tone="violet">This device</Badge>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Network</dt>
              <dd>
                <NetworkIndicator network={session.network} />
              </dd>
              <dt className="text-muted">Device</dt>
              <dd className="min-w-0 truncate" title={session.userAgent ?? undefined}>
                {session.userAgent ?? "Unknown device"}
              </dd>
              <dt className="text-muted">Last seen</dt>
              <dd>
                <DateTime iso={session.lastSeenAt} />
              </dd>
              <dt className="text-muted">Expires</dt>
              <dd>
                <DateTime iso={session.expiresAt} />
              </dd>
            </dl>
            <div>
              <Button variant="secondary" onClick={() => setTarget(session)}>
                {session.current ? (
                  "Sign out this device"
                ) : (
                  <>
                    Revoke
                    <span className="sr-only">
                      {" "}
                      session last seen {formatUtc(session.lastSeenAt)}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        title={copy.title}
        body={copy.body}
        confirmLabel={copy.confirmLabel}
        pending={pending}
        error={error}
        onConfirm={() => void confirmRevoke()}
        onCancel={closeConfirm}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bunx vitest run --project ui tests/ui/components/wallets-panel.test.tsx tests/ui/components/sessions-panel.test.tsx`
Expected: PASS, `Tests  13 passed`.
What would make it fail: sending the DELETE before confirmation (the Cancel cases expect zero requests), showing the raw `LAST_WALLET` code, or refreshing instead of navigating home after the current wallet or session is removed.

- [ ] **Step 5: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  1167 passed (1167)`.

- [ ] **Step 6: Commit**

```bash
git add src/components/wallets-panel.tsx src/components/sessions-panel.tsx tests/ui/components/wallets-panel.test.tsx tests/ui/components/sessions-panel.test.tsx
git commit -m "feat(components): add wallets and sessions settings panels" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 15: The app shell: top bar, sidebar, bottom nav, session expiry and outage state

Spec §5.1 (session expiry), §5.3 (shell), architecture §3.3 and §7.3/§7.4.

**Files:**
- Create: `src/components/app-shell/nav-items.ts`, `src/components/app-shell/nav-entry.tsx`, `src/components/app-shell/sidebar.tsx`, `src/components/app-shell/bottom-nav.tsx`, `src/components/app-shell/top-bar.tsx`, `src/components/app-shell/app-shell.tsx`, `src/components/session-expired-handler.tsx`, `src/components/service-unavailable.tsx`, `src/components/settings-nav.tsx`
- Test: `tests/ui/components/app-nav.test.tsx`, `tests/ui/components/top-bar.test.tsx`, `tests/ui/components/session-expired-handler.test.tsx`, `tests/ui/components/service-unavailable.test.tsx`

**Interfaces:**
- Consumes: `logout`, `onUnauthenticated` (`@/modules/wallet-connect`); `Badge`, `Button`, `cn`, `GhostLogo`, `NetworkIndicator`, `WalletStatus`, `useToast` (`@/ui`); `ConnectWalletModal`, `panelErrorCopy`, `useFreshNavigation`, `type AppPath` (Task 13); `Link` from `next/link`; `usePathname`/`useRouter` from `next/navigation`; `lucide-react` icons.
- Produces:
  - `interface NavItem { key; label; mobileLabel?; icon: LucideIcon; href: AppPath | null; soon; mobile; desktop }`, `NAV_ITEMS` (Dashboard [mobile "Home"], Send, Receive, Payments [desktop only], Activity, Settings [desktop only]), `isActive(item, pathname)`.
  - `NavEntry({ item, label, active, compact })`: a `Link` with `aria-current="page"` when active, or for "Soon" items a `<button aria-disabled="true" aria-describedby=…>` whose description is the "Soon" badge.
  - `Sidebar()` (`<nav aria-label="Main">`, hidden below 768px), `BottomNav()` (`<nav aria-label="Main mobile">`, fixed, hidden from 768px).
  - `TopBar({ viewer: ShellViewer })` (wordmark link to `/dashboard`, network indicator, Settings link, wallet menu; Copy → clipboard + toast "Address copied"; Switch network → `ConnectWalletModal` in sign-in mode on the other network; Sign out → `logout()` → toast "You're signed out." + `navigate("/")`, or an error toast unless `UNAUTHENTICATED`).
  - `interface ShellViewer { address: string; network: SolanaNetwork }`, `AppShell({ viewer, children })` (server component: top bar, sidebar, `<main id="main" tabIndex={-1}>`, bottom nav, `SessionExpiredHandler`).
  - `SessionExpiredHandler(): null` (registers `onUnauthenticated`: toast "Your session ended. Sign in again to continue." + `navigate("/")`; unregisters on unmount).
  - `ServiceUnavailable({ variant?: "page" | "section" })` ("We can't reach GHOST WIRE right now." / "Check your connection and try again." / "Try again" → `router.refresh()`; `page` has its own `<main>` and `<h1>`, `section` sits inside the shell with an `<h2>`).
  - `SettingsNav()` (`<nav aria-label="Settings">` with Wallets / Sessions links and `aria-current`).

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/components/app-nav.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { Sidebar } from "@/components/app-shell/sidebar";
import { SettingsNav } from "@/components/settings-nav";
import { routerMock, setPathname } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

/** Each entry's visible label: the first <span> inside its link or button. */
function names(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("a > span, button > span")?.textContent ?? "");
}

describe("Sidebar", () => {
  it("marks Dashboard current on /dashboard and lists Send/Receive/Payments/Activity as Soon", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(names(nav)).toEqual([
      "Dashboard",
      "Send",
      "Receive",
      "Payments",
      "Activity",
      "Settings",
    ]);
    const dashboard = within(nav).getByRole("link", { name: "Dashboard" });
    expect(dashboard.getAttribute("aria-current")).toBe("page");
    expect(dashboard.getAttribute("href")).toBe("/dashboard");
    expect(
      within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current"),
    ).toBeNull();
    for (const label of ["Send", "Receive", "Payments", "Activity"]) {
      expect(within(nav).queryByRole("link", { name: new RegExp(label) })).toBeNull();
      const button = within(nav).getByRole("button", { name: `${label} Soon` });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      const description = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(description?.textContent).toBe("Soon");
    }
  });

  it("marks Settings current on any settings page", () => {
    setPathname("/settings/sessions");
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("does nothing when a Soon item is pressed", async () => {
    render(<Sidebar />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send Soon" }));
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe("BottomNav", () => {
  it("shows Home, Send, Receive and Activity, and no Settings or Payments", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Main mobile" });
    expect(names(nav)).toEqual(["Home", "Send", "Receive", "Activity"]);
    expect(within(nav).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "Settings" })).toBeNull();
    expect(
      within(nav).getByRole("button", { name: "Activity Soon" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("SettingsNav", () => {
  it("marks the open settings page", () => {
    setPathname("/settings/wallets");
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Wallets" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Sessions" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
```

Create `tests/ui/components/top-bar.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "@/components/app-shell/top-bar";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, noContent, type FakeApi, type FakeHandler } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

const ADDRESS = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";
let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

function setup(
  logout: FakeHandler = () => noContent(),
  network: "devnet" | "mainnet-beta" = "devnet",
) {
  api = mockApi({ "POST /api/v1/auth/logout": logout });
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <TopBar viewer={{ address: ADDRESS, network }} />
    </ToastProvider>,
  );
  return user;
}

const politeText = () =>
  screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite")
    ?.textContent ?? "";

describe("TopBar", () => {
  it("shows the wordmark, the network as text, a Settings link and the wallet menu", () => {
    setup(undefined, "mainnet-beta");
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "GHOST WIRE" }).getAttribute("href")).toBe(
      "/dashboard",
    );
    expect(header.textContent).toContain("Mainnet-beta");
    expect(within(header).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/settings/wallets",
    );
    expect(within(header).getByRole("button", { name: /^Wallet menu/ }).textContent).toContain(
      "7Np4…T4K2",
    );
  });

  it("signs out: POST /auth/logout, toast, then replace('/') and refresh", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(api?.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      "POST /api/v1/auth/logout",
    ]);
    expect(politeText()).toContain("You're signed out.");
  });

  it("shows an error toast and stays when sign-out fails", async () => {
    const user = setup(() => json(503, { code: "DEPENDENCY_UNAVAILABLE", message: "x" }));
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "We can't reach GHOST WIRE right now. Check your connection and try again.",
      ),
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("Switch network opens the sign-in modal on the other network", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Switch to Mainnet-beta" }));
    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect(
      (within(dialog).getByRole("radio", { name: "Mainnet-beta" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(dialog.textContent).toContain("Private payments aren't available on mainnet yet.");
  });

  it("Copy address copies the full address and confirms with a toast", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /^Wallet menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "Copy address" }));
    expect(await navigator.clipboard.readText()).toBe(ADDRESS);
    await waitFor(() => expect(politeText()).toContain("Address copied"));
  });
});
```

Create `tests/ui/components/session-expired-handler.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionExpiredHandler } from "@/components/session-expired-handler";
import { me } from "@/modules/wallet-connect";
import { ToastProvider } from "@/ui/toast";
import { json, mockApi, type FakeApi } from "../../helpers/fake-api";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

let api: FakeApi | null = null;

afterEach(() => {
  api?.restore();
  api = null;
});

describe("SessionExpiredHandler", () => {
  it("toasts and returns to / when an API call answers UNAUTHENTICATED", async () => {
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    render(
      <ToastProvider>
        <SessionExpiredHandler />
      </ToastProvider>,
    );
    await me();
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("status").textContent).toContain(
      "Your session ended. Sign in again to continue.",
    );
  });

  it("unregisters on unmount", async () => {
    api = mockApi({ "GET /api/v1/me": () => json(401, { code: "UNAUTHENTICATED", message: "m" }) });
    const { unmount } = render(
      <ToastProvider>
        <SessionExpiredHandler />
      </ToastProvider>,
    );
    unmount();
    await me();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
```

Create `tests/ui/components/service-unavailable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { routerMock } from "../../helpers/next-navigation";

vi.mock(
  "next/navigation",
  async () => (await import("../../helpers/next-navigation")).navigationMock,
);

describe("ServiceUnavailable", () => {
  it("is a page with its own main and h1 and retries with router.refresh()", async () => {
    render(<ServiceUnavailable />);
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "We can't reach GHOST WIRE right now.",
    );
    expect(main.textContent).toContain("Check your connection and try again.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders as a section with an h2 inside the shell", () => {
    render(<ServiceUnavailable variant="section" />);
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "We can't reach GHOST WIRE right now.",
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run --project ui tests/ui/components/app-nav.test.tsx tests/ui/components/top-bar.test.tsx tests/ui/components/session-expired-handler.test.tsx tests/ui/components/service-unavailable.test.tsx`
Expected: FAIL, each file with `Failed to resolve import "@/components/…"`.

- [ ] **Step 3: Implement the navigation**

Create `src/components/app-shell/nav-items.ts`:

```ts
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  LayoutDashboard,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { AppPath } from "../use-fresh-navigation";

export interface NavItem {
  readonly key: string;
  readonly label: string;
  /** The bottom-nav label when it differs ("Home"). */
  readonly mobileLabel?: string;
  readonly icon: LucideIcon;
  /** null for "Soon" items, which are not links. */
  readonly href: AppPath | null;
  readonly soon: boolean;
  readonly mobile: boolean;
  readonly desktop: boolean;
}

/** Shared by the desktop sidebar and the mobile bottom nav. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    mobileLabel: "Home",
    icon: LayoutDashboard,
    href: "/dashboard",
    soon: false,
    mobile: true,
    desktop: true,
  },
  {
    key: "send",
    label: "Send",
    icon: ArrowUpRight,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "receive",
    label: "Receive",
    icon: ArrowDownLeft,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "payments",
    label: "Payments",
    icon: ReceiptText,
    href: null,
    soon: true,
    mobile: false,
    desktop: true,
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
    href: null,
    soon: true,
    mobile: true,
    desktop: true,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings/wallets",
    soon: false,
    mobile: false,
    desktop: true,
  },
];

/** Settings stays active on every /settings/* page. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === null) return false;
  return item.key === "settings" ? pathname.startsWith("/settings") : pathname === item.href;
}
```

Create `src/components/app-shell/nav-entry.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useId } from "react";
import { Badge } from "@/ui/badge";
import { cn } from "@/ui/cn";
import type { NavItem } from "./nav-items";

/**
 * One nav entry. A live item is a Link (aria-current="page" when active, violet treatment).
 * A "Soon" item is a button with aria-disabled="true", described by its "Soon" badge; it does
 * nothing when pressed.
 */
export function NavEntry({
  item,
  label,
  active,
  compact,
}: {
  readonly item: NavItem;
  readonly label: string;
  readonly active: boolean;
  readonly compact: boolean;
}) {
  const soonId = useId();
  const Icon = item.icon;
  const layout = compact
    ? "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs"
    : "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm";
  if (item.href === null || item.soon) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={soonId}
        className={cn(layout, "cursor-not-allowed text-muted")}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span>{label}</span>
        <Badge>
          <span id={soonId}>Soon</span>
        </Badge>
      </button>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        layout,
        "font-medium",
        active ? "text-violet" : "text-text hover:bg-elevated",
        active && !compact && "bg-elevated",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
```

Create `src/components/app-shell/sidebar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { NavEntry } from "./nav-entry";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Desktop navigation (≥ 768px). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 py-6 md:block">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => item.desktop).map((item) => (
          <li key={item.key}>
            <NavEntry
              item={item}
              label={item.label}
              active={isActive(item, pathname)}
              compact={false}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `src/components/app-shell/bottom-nav.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { NavEntry } from "./nav-entry";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Mobile navigation (< 768px): fixed to the bottom, padded for the safe area. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main mobile"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-obsidian pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.filter((item) => item.mobile).map((item) => (
          <li key={item.key}>
            <NavEntry
              item={item}
              label={item.mobileLabel ?? item.label}
              active={isActive(item, pathname)}
              compact
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `src/components/settings-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";

const LINKS = [
  { href: "/settings/wallets", label: "Wallets" },
  { href: "/settings/sessions", label: "Sessions" },
] as const;

/** The settings sub-navigation; aria-current marks the open page. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-2">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-medium",
                  active ? "border-violet text-violet" : "border-muted text-text hover:bg-elevated",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Implement the shell pieces**

Create `src/components/session-expired-handler.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { onUnauthenticated } from "@/modules/wallet-connect";
import { useToast } from "@/ui/toast";
import { useFreshNavigation } from "./use-fresh-navigation";

/**
 * Mounted only inside the (app) shell: any API call that answers UNAUTHENTICATED shows a toast
 * and returns to the start page. Renders nothing.
 */
export function SessionExpiredHandler(): null {
  const toast = useToast();
  const navigate = useFreshNavigation();
  useEffect(
    () =>
      onUnauthenticated(() => {
        toast.show({ message: "Your session ended. Sign in again to continue." });
        navigate("/");
      }),
    [toast, navigate],
  );
  return null;
}
```

Create `src/components/service-unavailable.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";

/**
 * Shown when the database is unreachable. "page" (default) is a whole page with its own <main>
 * and <h1> (the (app) layout renders it instead of the shell, so nobody is signed out by an
 * outage); "section" sits inside the shell's <main>, under the page's own <h1>.
 */
export function ServiceUnavailable({
  variant = "page",
}: {
  readonly variant?: "page" | "section";
}) {
  const router = useRouter();
  const Container = variant === "page" ? "main" : "section";
  const Heading = variant === "page" ? "h1" : "h2";
  return (
    <Container
      id={variant === "page" ? "main" : undefined}
      tabIndex={variant === "page" ? -1 : undefined}
      aria-labelledby="unavailable-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16"
    >
      <Heading id="unavailable-heading" className="font-heading text-2xl font-semibold">
        We can&apos;t reach GHOST WIRE right now.
      </Heading>
      <p className="text-muted">Check your connection and try again.</p>
      <div>
        <Button onClick={() => router.refresh()}>Try again</Button>
      </div>
    </Container>
  );
}
```

Create `src/components/app-shell/top-bar.tsx`:

```tsx
"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { logout } from "@/modules/wallet-connect";
import { GhostLogo } from "@/ui/ghost-logo";
import { NetworkIndicator } from "@/ui/network-indicator";
import { useToast } from "@/ui/toast";
import { WalletStatus } from "@/ui/wallet-status";
import { ConnectWalletModal } from "../connect-wallet-modal";
import { panelErrorCopy } from "../panel-copy";
import { useFreshNavigation } from "../use-fresh-navigation";
import type { ShellViewer } from "./app-shell";

/**
 * Wordmark, network indicator, Settings link and the wallet menu. Switch network opens the
 * connect modal in sign-in mode on the other network; the server replaces the old session.
 */
export function TopBar({ viewer }: { readonly viewer: ShellViewer }) {
  const toast = useToast();
  const navigate = useFreshNavigation();
  const [switching, setSwitching] = useState(false);
  const other: SolanaNetwork = viewer.network === "devnet" ? "mainnet-beta" : "devnet";

  const copyAddress = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(viewer.address);
      toast.show({ message: "Address copied" });
    } catch {
      toast.show({ message: "Couldn't copy the address", tone: "error" });
    }
  };

  const signOut = async (): Promise<void> => {
    const result = await logout();
    if (result.ok) {
      toast.show({ message: "You're signed out." });
      navigate("/");
    } else if (result.code !== "UNAUTHENTICATED") {
      toast.show({ message: panelErrorCopy(result), tone: "error" });
    }
  };

  return (
    <header className="border-b border-border bg-obsidian">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center">
            <GhostLogo />
          </Link>
          <NetworkIndicator network={viewer.network} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/wallets"
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm text-text hover:bg-elevated"
          >
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Link>
          <WalletStatus
            address={viewer.address}
            network={viewer.network}
            onCopyAddress={() => void copyAddress()}
            onSwitchNetwork={() => setSwitching(true)}
            onSignOut={() => void signOut()}
          />
        </div>
      </div>
      {switching && (
        <ConnectWalletModal
          open
          mode="sign-in"
          initialNetwork={other}
          onClose={() => setSwitching(false)}
        />
      )}
    </header>
  );
}
```

Create `src/components/app-shell/app-shell.tsx`:

```tsx
import type { ReactNode } from "react";
import type { SolanaNetwork } from "@/modules/validation";
import { SessionExpiredHandler } from "../session-expired-handler";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/** Plain, serializable data from the (app) layout. */
export interface ShellViewer {
  readonly address: string;
  readonly network: SolanaNetwork;
}

/** Server component: top bar, sidebar (≥ 768px), main, bottom nav (< 768px), session expiry. */
export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: ShellViewer;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar viewer={viewer} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4">
        <Sidebar />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pt-6 pb-28 md:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
      <SessionExpiredHandler />
    </div>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `bunx vitest run --project ui tests/ui/components/app-nav.test.tsx tests/ui/components/top-bar.test.tsx tests/ui/components/session-expired-handler.test.tsx tests/ui/components/service-unavailable.test.tsx`
Expected: PASS, `Tests  14 passed`.
What would make it fail: rendering "Soon" items as links or `<span>`s, putting Settings in the bottom nav, navigating on a failed logout, or not unregistering the session handler on unmount.

- [ ] **Step 6: Full gate**

Run: `bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: clean; `Tests  1181 passed (1181)`.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-shell src/components/session-expired-handler.tsx src/components/service-unavailable.tsx src/components/settings-nav.tsx tests/ui/components/app-nav.test.tsx tests/ui/components/top-bar.test.tsx tests/ui/components/session-expired-handler.test.tsx tests/ui/components/service-unavailable.test.tsx
git commit -m "feat(components): add app shell with top bar, sidebar, bottom nav and session expiry" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 16: Routes: landing, `(app)` layout, dashboard, settings, error and not-found pages

Spec §5.3, §8 and §10; architecture §4 and §7.4/§7.5. Server components read the session once per request through `loadShellState()` (React `cache`), never slide it, and never call `redirect()` inside a `try`.

**Files:**
- Create: `src/app/_server/shell-state.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/settings/layout.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/wallets/page.tsx`, `src/app/(app)/settings/sessions/page.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`
- Modify: `src/app/page.tsx`
- Test: `bun run build` route table plus a production smoke check with `curl` (E2E flows in Tasks 17–18 cover these pages end to end)

**Interfaces:**
- Consumes: `cookies()` (`next/headers`), `redirect()` (`next/navigation`), `cache` (`react`); `resolvePageSession`, `getMe`, `listSessions`, types `MeView`, `PageSession`, `SessionView` (`@/modules/auth`); `UnauthenticatedError`, `DependencyUnavailableError`, `logger` (`@/modules/shared`); `type WalletView` (`@/modules/wallet`); `AppShell`, `ServiceUnavailable`, `SettingsNav`, `WalletsPanel`, `SessionsPanel`, `ConnectButton` (Tasks 13–15); `Address`, `Card`, `NetworkIndicator`, `GhostLogo`, `Button` (`@/ui`).
- Produces: `type ShellState = { kind: "signed-out" } | { kind: "unavailable" } | { kind: "signed-in"; viewer: Viewer }`, `interface Viewer { me: MeView; currentWallet: WalletView; pageSession: PageSession }`, `loadShellState: () => Promise<ShellState>`. Static titles: "GHOST WIRE", "Dashboard · GHOST WIRE", "Wallets · GHOST WIRE", "Sessions · GHOST WIRE", "Page not found · GHOST WIRE". `/settings` redirects to `/settings/wallets`. The `MeView`/`WalletView`/`SessionView` → `MeData`-shaped props are checked structurally by TypeScript here.

- [ ] **Step 1: Implement the server loader**

Create `src/app/_server/shell-state.ts`:

```ts
import { cookies } from "next/headers";
import { cache } from "react";
import { getMe, resolvePageSession, type MeView, type PageSession } from "@/modules/auth";
import { DependencyUnavailableError, UnauthenticatedError, logger } from "@/modules/shared";
import type { WalletView } from "@/modules/wallet";

export interface Viewer {
  readonly me: MeView;
  readonly currentWallet: WalletView;
  readonly pageSession: PageSession;
}

export type ShellState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "signed-in"; readonly viewer: Viewer };

const SIGNED_OUT: ShellState = { kind: "signed-out" };
const UNAVAILABLE: ShellState = { kind: "unavailable" };

/**
 * One evaluation per request (React cache), shared by layouts and pages that render in
 * parallel. Reads the session without sliding it (server components never write). Never calls
 * redirect()/notFound(): callers do that outside any try block.
 */
export const loadShellState = cache(async (): Promise<ShellState> => {
  const store = await cookies();
  try {
    const pageSession = await resolvePageSession(store);
    if (pageSession === null) return SIGNED_OUT;
    const me = await getMe(pageSession);
    const walletId = pageSession.session.walletId.toHexString();
    const currentWallet = me.wallets.find((wallet) => wallet.id === walletId);
    // A session whose wallet is missing from the user's list: treat as signed out.
    if (currentWallet === undefined) return SIGNED_OUT;
    return { kind: "signed-in", viewer: { me, currentWallet, pageSession } };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return SIGNED_OUT;
    if (error instanceof DependencyUnavailableError) {
      logger.warn("page dependency unavailable", { code: error.code });
      return UNAVAILABLE;
    }
    throw error;
  }
});
```

- [ ] **Step 2: Implement the `(app)` routes**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { loadShellState } from "../_server/shell-state";

/** Signed out → "/" (redirect throws, so it stays outside any try). Outage → no shell, no redirect. */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const state = await loadShellState();
  if (state.kind === "signed-out") redirect("/");
  if (state.kind === "unavailable") return <ServiceUnavailable />;
  const { me, currentWallet } = state.viewer;
  return (
    <AppShell viewer={{ address: currentWallet.address, network: me.session.network }}>
      {children}
    </AppShell>
  );
}
```

Create `src/app/(app)/error.tsx`:

```tsx
"use client";

import { Button } from "@/ui/button";

/** Renders inside the shell, so navigation stays available. Never shows the message or stack. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;
  return (
    <section aria-labelledby="app-error-heading" className="flex flex-col gap-4 py-10">
      <h1 id="app-error-heading" className="font-heading text-2xl font-semibold">
        Something went wrong.
      </h1>
      {digest !== null && <p className="font-mono text-sm text-muted">Reference: {digest}</p>}
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </section>
  );
}
```

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Address } from "@/ui/address";
import { Card } from "@/ui/card";
import { NetworkIndicator } from "@/ui/network-indicator";
import { loadShellState } from "../../_server/shell-state";

export const metadata: Metadata = { title: "Dashboard · GHOST WIRE" };

/** No balances and no zero values: nothing is fabricated before private balances exist. */
export default async function DashboardPage() {
  const state = await loadShellState();
  if (state.kind !== "signed-in") return null; // the (app) layout redirects or shows the outage
  const { me, currentWallet } = state.viewer;
  const activeWallets = me.wallets.filter((wallet) => wallet.status === "active").length;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Dashboard</h1>
      <p className="text-lg">Your wallet is connected.</p>
      <Card title="Signed-in wallet">
        <div className="flex flex-col gap-3 text-sm">
          <Address value={currentWallet.address} copyable />
          <div>
            <NetworkIndicator network={me.session.network} />
          </div>
          <p>Linked wallets: {activeWallets}</p>
        </div>
      </Card>
      <Card title="Private balances">
        <p className="text-sm text-silver">Private balances arrive in a later release.</p>
      </Card>
    </div>
  );
}
```

Create `src/app/(app)/settings/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Settings</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
```

Create `src/app/(app)/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/wallets");
}
```

Create `src/app/(app)/settings/wallets/page.tsx`:

```tsx
import type { Metadata } from "next";
import { WalletsPanel } from "@/components/wallets-panel";
import { loadShellState } from "../../../_server/shell-state";

export const metadata: Metadata = { title: "Wallets · GHOST WIRE" };

export default async function WalletsPage() {
  const state = await loadShellState();
  if (state.kind !== "signed-in") return null;
  const { me, currentWallet } = state.viewer;
  return (
    <WalletsPanel
      wallets={me.wallets}
      currentWalletId={currentWallet.id}
      network={me.session.network}
    />
  );
}
```

Create `src/app/(app)/settings/sessions/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SessionsPanel } from "@/components/sessions-panel";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { listSessions, type SessionView } from "@/modules/auth";
import { DependencyUnavailableError, logger } from "@/modules/shared";
import { loadShellState } from "../../../_server/shell-state";

export const metadata: Metadata = { title: "Sessions · GHOST WIRE" };

export default async function SessionsPage() {
  const state = await loadShellState();
  if (state.kind !== "signed-in") return null;
  let sessions: SessionView[];
  try {
    sessions = await listSessions(state.viewer.pageSession);
  } catch (error) {
    if (!(error instanceof DependencyUnavailableError)) throw error;
    logger.warn("page dependency unavailable", { code: error.code });
    return <ServiceUnavailable variant="section" />;
  }
  return <SessionsPanel sessions={sessions} />;
}
```

- [ ] **Step 3: Implement the landing, root error and not-found pages**

Replace the whole of `src/app/page.tsx` with:

```tsx
import Link from "next/link";
import { ConnectButton } from "@/components/connect-button";
import { GhostLogo } from "@/ui/ghost-logo";
import { loadShellState } from "./_server/shell-state";

/** Landing hero. An outage counts as signed out: this page must not fail. */
export default async function HomePage() {
  const state = await loadShellState();
  const signedIn = state.kind === "signed-in";
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-16"
    >
      <GhostLogo />
      <h1 className="font-heading text-4xl font-bold sm:text-5xl">
        Your money. Your business. Your privacy.
      </h1>
      <p className="text-lg text-silver">
        Private SOL and USDC payments on Solana, with clear privacy boundaries.
      </p>
      <p className="text-sm text-muted">
        Private payments are coming in a later release. Sender and recipient addresses can remain
        public on Solana.
      </p>
      <div className="flex flex-wrap gap-3">
        {signedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-control bg-violet px-4 text-sm font-medium text-obsidian hover:bg-violet-hover"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <ConnectButton>Open GHOST WIRE</ConnectButton>
            <ConnectButton variant="secondary">Connect wallet</ConnectButton>
          </>
        )}
      </div>
    </main>
  );
}
```

Create `src/app/error.tsx`:

```tsx
"use client";

import { Button } from "@/ui/button";

/** Root error boundary (landing page and anything outside (app)). Digest only, never details. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === "string"
      ? (error as Error & { digest: string }).digest
      : null;
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold">Something went wrong.</h1>
      {digest !== null && <p className="font-mono text-sm text-muted">Reference: {digest}</p>}
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
```

Create `src/app/not-found.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found · GHOST WIRE" };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold">Page not found.</h1>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-violet underline underline-offset-4"
      >
        Go to the start page
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Type-check and build**

Run: `bun run lint && bun run typecheck && bun run build`
Expected: clean; the route table lists `ƒ /`, `ƒ /_not-found`, `ƒ /dashboard`, `ƒ /settings`, `ƒ /settings/sessions`, `ƒ /settings/wallets` (all dynamic) and `ƒ Proxy (Middleware)`. A lint error `Only src/app/** may import next/headers…` here would mean a file outside `src/app` imports `cookies` or `redirect`.

- [ ] **Step 5: Smoke-check the guards and the outage state without a database**

Run:
```bash
NODE_ENV=production MONGODB_URI="mongodb://127.0.0.1:1/?replicaSet=rs0" MONGODB_DB_NAME=gw_smoke APP_ORIGIN=http://127.0.0.1:3299 LOG_LEVEL=warn node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3299 > /tmp/gw-smoke.log 2>&1 &
sleep 4
for p in / /dashboard /settings/wallets /settings /nope; do printf "%s " $p; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://127.0.0.1:3299$p; done
curl -s http://127.0.0.1:3299/ | grep -o "Open GHOST WIRE\|Connect wallet" | sort -u
curl -s -H "cookie: gw_session=$(printf 'a%.0s' $(seq 43))" http://127.0.0.1:3299/dashboard | grep -o "We can&#x27;t reach GHOST WIRE right now."
kill $(ss -ltnp | grep ':3299 ' | grep -o 'pid=[0-9]*' | cut -d= -f2)
```
Expected: `/ 200`; `/dashboard`, `/settings/wallets` and `/settings` → `307 http://127.0.0.1:3299/` (no cookie); `/nope 404`; the landing page shows both "Connect wallet" and "Open GHOST WIRE"; a well-formed cookie with the database down renders "We can't reach GHOST WIRE right now." (status 200, no redirect, so an outage never signs anyone out). Kill only the server on port 3299.

- [ ] **Step 6: Full gate**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test`
Expected: `Tests  1181 passed (1181)` (no new Vitest tests in this task).

- [ ] **Step 7: Commit**

```bash
git add src/app/_server/shell-state.ts "src/app/(app)" src/app/page.tsx src/app/error.tsx src/app/not-found.tsx
git commit -m "feat(app): add landing, dashboard and settings routes with server session loader" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 17: Playwright E2E infrastructure, sign-in flows 1–3, the signed-out guard (flow 7), CSP checks and the README

Spec §11 (E2E), architecture §3.7 (E2E doubles), §6.3 and §8.4, decision D1. Global setup owns everything (Playwright starts a `webServer` before `globalSetup`, so a `webServer` could not receive the in-memory replica set's URI). Every spec imports `test` from `support/fixtures.ts`, whose automatic `guards` fixture enforces the privacy and CSP rules on every test.

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/support/origin.ts`, `tests/e2e/support/global-setup.ts`, `tests/e2e/support/keys.ts`, `tests/e2e/support/test-wallet.ts`, `tests/e2e/support/fixtures.ts`, `tests/e2e/sign-in.spec.ts`, `tests/e2e/guards.spec.ts`
- Modify: `README.md`
- Test: `bun run test:e2e`

**Interfaces:**
- Consumes: the whole app (Tasks 1–16); `MongoMemoryReplSet` (`mongodb-memory-server-core`); `bs58` and `node:crypto` (allowed in E2E support); `AxeBuilder` (`@axe-core/playwright`); page copy and roles from Tasks 13–16 ("Connect wallet", dialog "Connect a wallet", radio "Devnet", the wallet's name as a button, "Approve the sign-in request in your wallet.", the preview `<dl>`, `role="alert"` failures, "Try again", "Reconnect", `banner`, "Wallet menu …").
- Produces:
  - `E2E_PORT` (`GW_E2E_PORT` or `"3210"`), `E2E_ORIGIN` (`http://127.0.0.1:${E2E_PORT}`, so the cookie is `gw_session`).
  - `interface E2eKey { address: string; publicKey: number[]; pkcs8: number[] }`, `createE2eKey(): E2eKey`.
  - `type TestWalletMode = "approve" | "reject" | "disconnect" | "hang"`, `TestWalletSpec { name; icon; accounts: E2eKey[] }`, `TestWalletInit { wallets }`, `TestWalletControl { setMode(mode, walletName?); switchAccount(walletName, index); signCount(walletName?) }`, `installTestWallets(init)` (self-contained; registers through both Wallet Standard events; signs with WebCrypto Ed25519; exposes `window.__gwTestWallet`).
  - From `support/fixtures.ts`: `test` (fixtures `wallets: WalletKit { install(page, wallets: { name; keys }[]); key(): E2eKey }`, auto `guards`), `expect`, `expectNoSeriousAxeViolations(page)`, `setWalletMode(page, mode, walletName?)`, `walletSignCount(page, walletName?)`, `switchWalletAccount(page, walletName, index)`, `signInWith(page, walletName, network?: "Devnet" | "Mainnet-beta")` (from `/` through the modal to `/dashboard`).
  - The guards fail a test when: any request (not `data:`/`blob:`) leaves `E2E_ORIGIN`; any request URL, navigation URL, the final `<title>` or `localStorage` contains a test wallet address; a non-redirect document response lacks a `'nonce-` CSP; or the console reports a Content Security Policy violation.

- [ ] **Step 1: Install Chromium**

Run:
```bash
ls ~/.cache/ms-playwright 2>/dev/null
bunx playwright install chromium || PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 bunx playwright install chromium
```
Expected: `chromium-1254` and `chromium_headless_shell-1254` exist under `~/.cache/ms-playwright` (already present on this host). On Ubuntu 20.04 the plain install fails with `Playwright does not support chromium on ubuntu20.04-x64`; the override installs Chrome Headless Shell 158, which runs on this host without the override at test time (decision D1).

- [ ] **Step 2: Write the E2E support files**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./tests/e2e/support/origin";

// globalSetup owns Mongo, the build and the server: Playwright starts a webServer BEFORE
// globalSetup, so a webServer could not receive the in-memory replica set's URI.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === "true",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: E2E_ORIGIN, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Create `tests/e2e/support/origin.ts`:

```ts
/** http on 127.0.0.1, so the session cookie is gw_session (no __Host- prefix, no Secure). */
export const E2E_PORT = process.env.GW_E2E_PORT ?? "3210";
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
```

Create `tests/e2e/support/global-setup.ts`:

```ts
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { E2E_ORIGIN, E2E_PORT } from "./origin";

const require = createRequire(import.meta.url);
const READY_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;

async function probe(url: string, timeoutMs: number): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.pid === undefined || server.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
  process.kill(-server.pid, "SIGTERM");
  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(STOP_TIMEOUT_MS).then(() => true),
  ]);
  if (timedOut) process.kill(-server.pid, "SIGKILL");
}

/**
 * Starts an in-memory MongoDB replica set (MONGOMS_SYSTEM_BINARY is honoured), builds the app
 * (unless GW_E2E_SKIP_BUILD=1), starts `next start` on E2E_ORIGIN with an env built on top of
 * process.env (so a developer .env cannot leak in), waits for /api/ready and returns the teardown.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if ((await probe(`${E2E_ORIGIN}/api/health`, 500)) !== null) {
    throw new Error(`port ${E2E_PORT} is in use: stop that server or set GW_E2E_PORT`);
  }
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: "7.0.12" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri();
  if (/:27017(\/|,|\?|$)/.test(uri)) {
    await replSet.stop({ doCleanup: true });
    throw new Error("refusing to use port 27017 (the developer mongod)");
  }
  const nextBin = require.resolve("next/dist/bin/next");
  if (process.env.GW_E2E_SKIP_BUILD !== "1") {
    try {
      execFileSync(process.execPath, [nextBin, "build"], { stdio: "inherit" });
    } catch (error) {
      await replSet.stop({ doCleanup: true });
      throw error;
    }
  }

  mkdirSync("test-results", { recursive: true });
  const logPath = path.resolve("test-results", "e2e-server.log");
  const logFd = openSync(logPath, "w");
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", E2E_PORT], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      NODE_ENV: "production",
      MONGODB_URI: uri,
      MONGODB_DB_NAME: "gw_e2e",
      LOG_LEVEL: "warn",
      APP_ORIGIN: E2E_ORIGIN,
      SOLANA_NETWORKS: "devnet,mainnet-beta",
      TRUST_PROXY: "false",
      SESSION_IDLE_DAYS: "7",
      SESSION_MAX_DAYS: "30",
      RATE_LIMIT_CHALLENGE_PER_MIN: "1000",
      RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS: "1000",
      RATE_LIMIT_VERIFY_PER_MIN: "1000",
    },
  });
  closeSync(logFd);

  const teardown = async (): Promise<void> => {
    await stopServer(server);
    await replSet.stop({ doCleanup: true });
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const ready = await probe(`${E2E_ORIGIN}/api/ready`, 2_000);
    if (ready?.status === 200) break;
    if (Date.now() > deadline || server.exitCode !== null) {
      await teardown();
      throw new Error(`next start did not become ready; see ${logPath}`);
    }
    await sleep(250);
  }
  return teardown;
}
```

Create `tests/e2e/support/keys.ts`:

```ts
import { generateKeyPairSync } from "node:crypto";
import bs58 from "bs58";

/** Plain arrays, so the key survives page.addInitScript's JSON serialization. */
export interface E2eKey {
  readonly address: string;
  readonly publicKey: number[];
  readonly pkcs8: number[];
}

/** A fresh Ed25519 key; address = bs58 of the raw 32-byte public key. In memory only. */
export function createE2eKey(): E2eKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  if (typeof jwk.x !== "string") throw new Error("ed25519 JWK export has no x");
  const raw = Buffer.from(jwk.x, "base64url");
  return {
    address: bs58.encode(raw),
    publicKey: [...raw],
    pkcs8: [...privateKey.export({ format: "der", type: "pkcs8" })],
  };
}
```

`installTestWallets` is serialized into the page by `page.addInitScript`: keep it free of runtime imports and outer references, and keep `new Uint8Array(…)` around every `crypto.subtle` input (TS 6 `BufferSource` rule; `next build` type-checks this file).

Create `tests/e2e/support/test-wallet.ts`:

```ts
import type { E2eKey } from "./keys";

export type TestWalletMode = "approve" | "reject" | "disconnect" | "hang";

export interface TestWalletSpec {
  readonly name: string;
  readonly icon: string;
  readonly accounts: readonly E2eKey[];
}

export interface TestWalletInit {
  readonly wallets: readonly TestWalletSpec[];
}

export interface TestWalletControl {
  /** undefined = every wallet. */
  setMode(mode: TestWalletMode, walletName?: string): void;
  /** Makes accounts[index] the only connected account and emits standard:events change. */
  switchAccount(walletName: string, index: number): void;
  signCount(walletName?: string): number;
}

/**
 * Runs in the page via page.addInitScript, which serializes this function: it must stay
 * self-contained (no imports at runtime, no outer references). Each spec becomes a Wallet
 * Standard wallet (chains solana:devnet + solana:mainnet; standard:connect, standard:events,
 * solana:signMessage 1.1.0) that signs with WebCrypto Ed25519, so the server verifies real
 * signatures. Registers through both halves of the Wallet Standard protocol and exposes
 * window.__gwTestWallet.
 */
export function installTestWallets(init: TestWalletInit): void {
  const CHAINS = ["solana:devnet", "solana:mainnet"] as const;
  interface Control {
    mode: TestWalletMode;
    signCount: number;
    switchAccount(index: number): void;
  }
  const controls = new Map<string, Control>();

  for (const spec of init.wallets) {
    const accounts = spec.accounts.map((account) =>
      Object.freeze({
        address: account.address,
        publicKey: new Uint8Array(account.publicKey),
        chains: CHAINS,
        features: ["solana:signMessage"] as const,
      }),
    );
    const keys = spec.accounts.map((account) =>
      crypto.subtle.importKey("pkcs8", new Uint8Array(account.pkcs8), { name: "Ed25519" }, false, [
        "sign",
      ]),
    );
    let connected: readonly (typeof accounts)[number][] = accounts;
    const listeners = new Set<(properties: { accounts?: readonly unknown[] }) => void>();
    const emit = (properties: { accounts?: readonly unknown[] }): void => {
      for (const listener of [...listeners]) listener(properties);
    };
    const control: Control = {
      mode: "approve",
      signCount: 0,
      switchAccount(index) {
        const account = accounts[index];
        if (account === undefined) return;
        connected = [account];
        emit({ accounts: connected });
      },
    };
    controls.set(spec.name, control);

    const wallet = {
      version: "1.0.0" as const,
      name: spec.name,
      icon: spec.icon,
      chains: CHAINS,
      get accounts() {
        return connected;
      },
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: connected }) },
        "standard:events": {
          version: "1.0.0",
          on: (
            _event: "change",
            listener: (properties: { accounts?: readonly unknown[] }) => void,
          ) => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        },
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async (
            ...inputs: { account: { address: string }; message: Uint8Array }[]
          ) => {
            control.signCount += 1;
            if (control.mode === "reject") {
              throw Object.assign(new Error("User rejected the request."), { code: 4001 });
            }
            if (control.mode === "disconnect") {
              emit({ accounts: [] });
              const error = new Error("Wallet disconnected");
              error.name = "WalletDisconnectedError";
              throw error;
            }
            if (control.mode === "hang") return new Promise<never>(() => undefined);
            return Promise.all(
              inputs.map(async (input) => {
                const key = keys[accounts.findIndex((a) => a.address === input.account.address)];
                if (key === undefined) throw new Error("unknown account");
                const signature = new Uint8Array(
                  await crypto.subtle.sign(
                    { name: "Ed25519" },
                    await key,
                    new Uint8Array(input.message),
                  ),
                );
                return {
                  signedMessage: input.message,
                  signature,
                  signatureType: "ed25519" as const,
                };
              }),
            );
          },
        },
      },
    };

    const register = (api: { register: (w: unknown) => () => void }): void => {
      api.register(wallet);
    };
    window.addEventListener("wallet-standard:app-ready", (event) =>
      register((event as CustomEvent<{ register: (w: unknown) => () => void }>).detail),
    );
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  }

  const matching = (walletName?: string): Control[] =>
    [...controls]
      .filter(([name]) => walletName === undefined || name === walletName)
      .map(([, c]) => c);
  const api: TestWalletControl = {
    setMode(mode, walletName) {
      for (const control of matching(walletName)) control.mode = mode;
    },
    switchAccount(walletName, index) {
      controls.get(walletName)?.switchAccount(index);
    },
    signCount(walletName) {
      return matching(walletName).reduce((sum, control) => sum + control.signCount, 0);
    },
  };
  (window as unknown as { __gwTestWallet: TestWalletControl }).__gwTestWallet = api;
}
```

Create `tests/e2e/support/fixtures.ts`:

```ts
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
    async ({ page, addresses }, provide) => {
      const requestUrls: string[] = [];
      const navigations: string[] = [];
      const problems: string[] = [];
      page.on("request", (request) => requestUrls.push(request.url()));
      page.on("framenavigated", (frame) => navigations.push(frame.url()));
      page.on("console", (message) => {
        if (/Content Security Policy/i.test(message.text()))
          problems.push(`CSP console: ${message.text()}`);
      });
      page.on("response", (response) => {
        if (response.request().resourceType() !== "document") return;
        if (response.status() >= 300 && response.status() < 400) return;
        const csp = response.headers()["content-security-policy"] ?? "";
        if (!csp.includes("'nonce-")) problems.push(`no nonce CSP on ${response.url()}`);
      });

      await provide();

      for (const url of requestUrls) {
        if (url.startsWith("data:") || url.startsWith("blob:")) continue;
        if (new URL(url).origin !== E2E_ORIGIN) problems.push(`third-party request: ${url}`);
      }
      const texts = [...requestUrls, ...navigations];
      if (!page.isClosed()) {
        texts.push(await page.title());
        texts.push(await page.evaluate(() => JSON.stringify({ ...localStorage })).catch(() => ""));
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
```

- [ ] **Step 3: Write the flow specs**

Create `tests/e2e/sign-in.spec.ts`:

```ts
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
  await expect(preview).toContainText("127.0.0.1:3210");
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
```

Create `tests/e2e/guards.spec.ts`:

```ts
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
```

- [ ] **Step 4: Run the E2E suite**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test:e2e`
Expected: `next build` output, then `Running 9 tests using 1 worker` and `9 passed` (about 20 s after the build). If it fails with `port 3210 is in use`, another server answers there: stop it if it is yours, or set `GW_E2E_PORT`. Server output is in `test-results/e2e-server.log`.

- [ ] **Step 5: Prove the guards bite (temporary file, not committed)**

Create `tests/e2e/zz-mutation.spec.ts`:
```ts
import { test } from "./support/fixtures";

test("leaks an address into a URL (must fail)", async ({ page, wallets }) => {
  const key = wallets.key();
  await page.goto(`/?ref=${key.address}`);
});

test("third-party request (must fail)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => fetch("https://example.invalid/x").catch(() => undefined));
});
```
Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod GW_E2E_SKIP_BUILD=1 bunx playwright test tests/e2e/zz-mutation.spec.ts --reporter=line`
Expected: `2 failed`: the first with `address leaked: …`, the second with `CSP console: Connecting to 'https://example.invalid/x' violates … "connect-src 'self'"`. Then delete the file: `rm tests/e2e/zz-mutation.spec.ts`.

- [ ] **Step 6: Update the README**

Apply these three edits to `README.md`.

(a) In the Scripts table, replace the row
````markdown
| `bun run test`                                   | All Vitest projects (unit + integration)                            |
| `bun run test:unit` / `bun run test:integration` | One project only                                                    |
````
with
````markdown
| `bun run test`                                   | All Vitest projects (unit + integration + ui)                       |
| `bun run test:unit` / `bun run test:integration` | One project only                                                    |
| `bun run test:ui`                                | Component tests only (happy-dom + React Testing Library)            |
| `bun run test:e2e`                               | Playwright end-to-end tests (Chromium; see below)                   |
````

(b) Insert directly before the `### Auth API` heading:
````markdown
### UI development

- Brand tokens (colours, radii, fonts) live in `@theme` in `src/app/globals.css` (Tailwind CSS v4).
  The theme is dark only; violet is for primary buttons, the selected nav item, focus rings and
  brand accents.
- Primitives without domain logic live in `src/ui/`; feature components in `src/components/`;
  the client-only wallet module in `src/modules/wallet-connect/` (Wallet Standard, no
  `@solana/web3.js`). See [ADR-0007](docs/adr/0007-frontend-stack-wallet-connection.md).
- Client code (`wallet-connect`, `ui`, `components`) may import only `@/modules/validation` and
  `@/modules/wallet-connect` among modules, and never `node:*`; `src/ui` never imports features.
- Fonts are self-hosted from `node_modules`; there are no analytics and no third-party requests.
- Pages get a per-request nonce Content-Security-Policy from `src/proxy.ts`, so every page is
  dynamically rendered. Never add inline scripts or third-party origins.
- Dates show in UTC. Never put an address, token or id in a URL, title or `localStorage`.

### End-to-end tests

```bash
bunx playwright install chromium
# Ubuntu 20.04 hosts: Playwright 1.65 refuses that platform; this override works there
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 bunx playwright install chromium

MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test:e2e
```

The global setup starts an in-memory MongoDB replica set, runs `next build`, starts `next start`
on `http://127.0.0.1:3210` and waits for `/api/ready`. Options:

- `GW_E2E_PORT=<port>`: another port (the run refuses to start if the port already answers).
- `GW_E2E_SKIP_BUILD=1`: reuse the existing `.next` build.

Reports go to `playwright-report/` (HTML) and `test-results/` (traces, screenshots and the server
log `test-results/e2e-server.log`). E2E is not part of `bun run test`, so the core gates stay
offline-capable. Real Phantom and Solflare checks are manual:
[docs/testing/wallet-compat.md](docs/testing/wallet-compat.md).

````
(The ADR and checklist links resolve after Task 18.)

(c) In "Module boundaries", replace from the line starting `4. Only \`src/modules/config/**\`` through the paragraph ending `need their own scope in \`eslint.config.mjs\`.` with:
````markdown
4. Only `src/modules/config/**` may read `process.env` (exceptions: tooling config files, `src/instrumentation.ts`, `src/proxy.ts`, test setup, helpers and E2E support).
5. Client code (`src/modules/wallet-connect/**`, `src/ui/**`, `src/components/**`) may import only `@/modules/validation` and `@/modules/wallet-connect` among modules, and never `node:*`. Server modules never import `@/modules/wallet-connect`, `@/ui/*` or `@/components/*`. `src/ui/**` never imports `@/modules/wallet-connect` or `@/components/*`.
6. Only `src/app/**` imports `next/headers` and the server functions of `next/navigation` (`redirect`, `notFound`, …).
7. Only `src/modules/wallet/internal/base58.ts` and `src/modules/wallet-connect/internal/base58.ts` import `bs58` (tests and helpers are exempt).

`auth` depends only on `wallet`, `security`, `database`, `config` and `shared`.

The rules also cover dynamic `import()` and `require()`. The lint scopes are an allowlist of paths, so a
new top-level directory (such as `scripts/`) or new extensions (such as `.mts` or `.js`) need their own
scope in `eslint.config.mjs`.
````

- [ ] **Step 7: Full gate**

Run:
```bash
bun run lint && bun run typecheck && MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test && bun run build
node node_modules/prettier/bin/prettier.cjs --check README.md playwright.config.ts tests/e2e
git status --short
```
Expected: clean; `Tests  1181 passed (1181)`; build succeeds (it type-checks `tests/e2e`); Prettier clean; `git status` shows no `playwright-report/` or `test-results/` (both ignored) and no `zz-mutation.spec.ts`.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e/support tests/e2e/sign-in.spec.ts tests/e2e/guards.spec.ts README.md
git commit -m "test(e2e): add Playwright suite with real-signature test wallet and privacy/CSP guards" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

### Task 18: E2E flows 4–6 and 8, axe on every page, ADR-0007 and the manual wallet checklist

Spec §11 (flows 4, 5, 6, 8; axe), §13 criteria 2, 3, 6, 7; architecture §6.7 and §8.4.

**Files:**
- Create: `tests/e2e/network-switch.spec.ts`, `tests/e2e/wallets.spec.ts`, `tests/e2e/sessions.spec.ts`, `tests/e2e/mobile.spec.ts`, `tests/e2e/a11y.spec.ts`, `docs/adr/0007-frontend-stack-wallet-connection.md`, `docs/testing/wallet-compat.md`
- Test: `bun run test:e2e`

**Interfaces:**
- Consumes: `test`, `expect`, `expectNoSeriousAxeViolations`, `setWalletMode`, `signInWith` (Task 17); page copy from Tasks 13–16 ("Wallet menu", menu item "Switch to Mainnet-beta", region "Active sessions", region "Wallets", "Link another wallet", dialog "Link another wallet", "Wallet linked.", buttons "Unlink wallet AbCd…WxYz", dialog "Unlink this wallet?", "Wallet unlinked.", "You can't unlink your only wallet.", "Sign out this device", dialog "Sign out this device?", nav "Main mobile", nav "Main", heading "Page not found.").
- Produces: the complete E2E suite (15 tests); ADR-0007 recording B2, B3, B4 and the CSP mechanism; the manual checklist with an empty results table.

- [ ] **Step 1: Write the flow specs**

Create `tests/e2e/network-switch.spec.ts`:

```ts
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
```

Create `tests/e2e/wallets.spec.ts`:

```ts
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
```

Create `tests/e2e/sessions.spec.ts`:

```ts
import { expect, signInWith, test } from "./support/fixtures";

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
```

Create `tests/e2e/mobile.spec.ts`:

```ts
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
```

Create `tests/e2e/a11y.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the full E2E suite**

Run: `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test:e2e`
Expected: `Running 15 tests using 1 worker` and `15 passed`. If axe reports `label-content-name-mismatch` on `button[aria-haspopup="menu"]`, the menu button carries an `aria-label`; Task 12's `MenuButton` must use the sr-only prefix instead.

- [ ] **Step 3: Write ADR-0007 and the manual checklist**

Create `docs/adr/0007-frontend-stack-wallet-connection.md`:

```markdown
# ADR-0007: Frontend stack and wallet connection

- **Status:** Accepted
- **Date:** 2026-11-13
- **Owner / approver:** Frontend Engineer (AgenKit) / project owner (approved in brainstorming,
  decisions B2–B4; CSP mechanism and Playwright host override approved as D1 and D3)

## Decision

- **Wallet connection (B2).** Wallets are discovered and connected through Wallet Standard
  directly: `@wallet-standard/app` (`getWallets()`), `@wallet-standard/base` and
  `@wallet-standard/features` types, `@solana/wallet-standard-features` (`solana:signMessage`), and
  our own hooks in `src/modules/wallet-connect`. No `@solana/web3.js`, no `@solana/kit`, no
  `@solana/wallet-adapter-*`. Sign-in signs the 02a message (ADR-0006) with `solana:signMessage`
  and never requests a transaction signature.
- **Styling and primitives (B3).** Tailwind CSS v4 with the brand tokens in `@theme`
  (`src/app/globals.css`), our own accessible primitives in `src/ui` built on the native `<dialog>`
  element, Lucide icons (always next to a visible label), and self-hosted fonts through
  `next/font/local` from `@fontsource-variable/inter`, `@fontsource-variable/space-grotesk` and
  `geist` (Geist Mono). No shadcn/Radix, no CSS-in-JS, no third-party font requests.
- **Testing (B4).** Three layers: Vitest + React Testing Library + happy-dom (project `ui`) with a
  fake Wallet Standard wallet; Playwright E2E (Chromium) with an injected test wallet that signs
  with real Ed25519 (WebCrypto), plus axe; and a manual Phantom and Solflare checklist on devnet
  (`docs/testing/wallet-compat.md`).
- **Content Security Policy (D3).** `script-src 'self'` alone breaks hydration in Next 16 (inline
  flight-data scripts). Pages therefore get a per-request nonce CSP from `src/proxy.ts`
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`), and the root layout calls `await connection()`
  so every page renders per request and receives the nonce. API routes get a separate
  `default-src 'none'` CSP from `next.config.ts`.

## Context

PR 02b ships the first user-facing slice: the app shell, the connect and sign-in flow with every
failure state, and wallet and session settings, on top of the 02a API. Privacy features (Helius,
private balances) arrive in PR 03 and later, so nothing here may claim or imply privacy capability.

## Rationale

- Wallet Standard is what Phantom and Solflare inject; using it directly keeps the client small and
  avoids pinning `@solana/kit` before PR 03 chooses its Solana client stack.
- Owning the primitives keeps every accessibility behaviour (focus trap, focus return, Escape,
  live regions, label-in-name) under test in happy-dom and Chromium alike.
- A fake wallet in component tests and a real-signature test wallet in E2E prove the full
  server-side verification path without a browser extension; the manual checklist covers what
  only real wallets can show (error shapes, mobile injection timing).

## Alternatives considered

| Option | Why not |
| --- | --- |
| `@solana/react` (kit hooks) | Pins `@solana/kit` before PR 03 decides on it |
| `@solana/wallet-adapter-react` | Requires `@solana/web3.js` v1 |
| shadcn/ui (Radix) | Large dependency surface for a handful of primitives |
| CSS Modules | Tokens and responsive utilities are simpler in Tailwind v4 `@theme` |
| CSP `script-src 'self'` | Blocks Next 16's inline flight scripts (spike, architecture §9.4) |
| Next experimental SRI | Experimental, and does not cover inline flight scripts of dynamic pages |

## Evidence / references

- Spec: `docs/specs/2026-11-13-connect-ui-design.md` (B1–B7, §9 headers, §11 tests).
- Architecture: `docs/specs/2026-11-13-connect-ui-architecture.md` (§6.4 CSP, §9 spike evidence,
  §10.1 decisions D1–D4).

## Consequences

- No static pages: every page is dynamic (`connection()`), including the 404. Responses carry
  `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
- `'strict-dynamic'` is in `script-src`; scripts load only through Next's nonce-bearing chunks.
- Playwright 1.65 refuses to install Chromium on Ubuntu 20.04; set
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64` for the install there (D1). Other hosts need
  nothing extra.
- `classifyWalletError` relies on heuristics (code 4001, rejection and disconnect wording). The
  manual checklist records the real Phantom and Solflare shapes and confirms or adjusts them.

## Scope / privacy / security impact

- No analytics and no third-party requests (enforced by CSP `connect-src 'self'` and the E2E
  privacy guard). No address, token, session id or wallet id in any URL, title or `localStorage`.
- The app never asks for a seed phrase or private key and only ever requests `signMessage`.
- Copy never claims anonymity or untraceability; it states that sender and recipient addresses can
  remain public on Solana, and connecting a wallet does not mean privacy is set up.
```

Create `docs/testing/wallet-compat.md`:

```markdown
# Wallet compatibility checklist (manual)

Acceptance criterion 6 of PR 02b: Phantom and Solflare results on **devnet** are recorded here
**before merge**. Rows are filled in only from real runs; never copy a result from another row or
from an automated test.

## Setup

1. Start the app (`bun run build && bun run start`, or a preview deployment) with
   `SOLANA_NETWORKS=devnet,mainnet-beta`.
2. Use a fresh browser profile (desktop) or a freshly opened in-app browser (mobile).
3. Switch the wallet to devnet in its own network or developer settings. Use a throwaway account;
   never use an account that holds real funds. Write the exact steps you used in the Notes column.
4. Have at least two accounts in the wallet (for the account-switch and link checks).

## Checklist per run

| Check | Steps | Expected result |
| --- | --- | --- |
| Connect | `/` → Connect wallet → pick the wallet | The wallet asks to connect; the modal shows "Approve the sign-in request in your wallet." with this site's domain, your truncated address and "Devnet" |
| Sign-in | Approve the message | Lands on `/dashboard`; the top bar shows "Devnet" and your address; no transaction prompt ever appears |
| Sign rejection | Start again, reject in the wallet | "You cancelled the sign-in." and Try again works |
| Wallet disconnect | Start, then disconnect the site in the wallet before approving | "Your wallet disconnected." and Reconnect works |
| Account switch | Start, then switch accounts in the wallet before approving | "Your wallet switched accounts. Start again with the new account." and Start again works |
| Link | `/settings/wallets` → Link another wallet → the second account | "Wallet linked."; the list shows two wallets |
| Unlink | Unlink the second wallet; then try the last one | "Wallet unlinked."; then "You can't unlink your only wallet." |

## Results

| Date | Wallet | Wallet version | Platform (desktop extension / mobile in-app) | Browser + version | Connect | Sign-in | Reject | Disconnect | Account switch | Link | Unlink | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | Phantom |  | desktop extension |  |  |  |  |  |  |  |  |  |
|  | Phantom |  | mobile in-app |  |  |  |  |  |  |  |  |  |
|  | Solflare |  | desktop extension |  |  |  |  |  |  |  |  |  |
|  | Solflare |  | mobile in-app |  |  |  |  |  |  |  |  |  |

Use `pass`, `fail` or `n/a` (with a note) in each check column.

## Error shapes seen

Record the exact error each wallet produced, from the browser console (`classifyWalletError` maps
code 4001 or text matching /reject|denied|cancel/ to "rejected", and /disconnect|not ?connected/
to "disconnected"; anything else shows the generic retry). If a real shape is classified wrongly,
open a fix before merge.

| Wallet | Action | Error `name` | Error `message` | `code` | Nested `cause` / `error` | Classified as |
| --- | --- | --- | --- | --- | --- | --- |
| Phantom | reject sign |  |  |  |  |  |
| Phantom | disconnect |  |  |  |  |  |
| Solflare | reject sign |  |  |  |  |  |
| Solflare | disconnect |  |  |  |  |  |
```

Do not fill in any result row. Criterion 6 requires real runs by a person (see "Manual checklist owner" below).

- [ ] **Step 4: Final verification (spec §13 criterion 1)**

Run:
```bash
git status --short
bun install --frozen-lockfile
bun run lint
bun run typecheck
MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test
bun run build
MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bun run test:e2e
grep -rniE "anonym|untraceab|seed phrase|private key" src/ || echo "no forbidden copy"
```
Expected: lockfile unchanged; lint and typecheck clean; `Tests  1181 passed (1181)` across `86` files; build succeeds; `15 passed`; the grep prints `no forbidden copy` (criterion 8).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/network-switch.spec.ts tests/e2e/wallets.spec.ts tests/e2e/sessions.spec.ts tests/e2e/mobile.spec.ts tests/e2e/a11y.spec.ts docs/adr/0007-frontend-stack-wallet-connection.md docs/testing/wallet-compat.md
git commit -m "test(e2e): cover network switch, wallets, sessions, mobile and axe; add ADR-0007 and wallet checklist" -m "Co-Authored-By: <your model name> <noreply@anthropic.com>"
```

---

## Acceptance checklist (spec §13)

| # | Criterion | Where it is met |
|---|---|---|
| 1 | A fresh clone with no `.env` passes `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun run test && bun run build`; after `bunx playwright install chromium` (on Ubuntu 20.04 with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64`, D1), `bun run test:e2e` passes | Every task's full gate; Task 1 (deps, scripts), Task 17 (E2E setup, README), Task 18 Step 4 (final run) |
| 2 | Every §5.2 state has a component test, and E2E flows 1–8 pass | Task 13 (`connect-wallet-copy.test.ts` every row × mode; `connect-wallet-modal.test.tsx` every state, 429 countdown, abort, picker); flows 1–3 and 7 in Task 17, flows 4–6 and 8 in Task 18 |
| 3 | axe reports zero serious or critical violations on every page | Task 18 `a11y.spec.ts` (`/` signed out, modal open, modal awaiting signature, 404, `/dashboard`, wallet menu open, `/settings/wallets`, unlink dialog, `/settings/sessions`); primitives in Tasks 11–12 |
| 4 | CSP and security headers present; no third-party requests; no sensitive value in any URL | Task 6 (proxy, headers, unit test, curl); Task 17 (`guards.spec.ts` header checks; the auto `guards` fixture on every E2E test: origin, URLs, title, `localStorage`, nonce CSP, CSP console) |
| 5 | The §7 backend changes are tested | Task 2 (log levels: unit + integration), Task 3 (stale cookie: unit + integration), Task 4 (`slide: false`, `resolvePageSession`), Task 5 (replace: same user, other user, events, best effort, link untouched) |
| 6 | `docs/testing/wallet-compat.md` exists and Phantom and Solflare devnet results are recorded before merge | Task 18 creates it; the results are recorded by a person (below) |
| 7 | ADR-0007 records B2, B3 and B4; the README documents the UI stack, `test:e2e` and the Chromium install | Task 18 (ADR-0007), Task 17 (README) |
| 8 | No copy claims anonymity or untraceability, or implies privacy is initialized | Global Constraints copy rules; Task 13 unit test scans every modal string; Task 16 landing copy; Task 18 Step 4 grep |

## Manual checklist owner (criterion 6)

Criterion 6 cannot be met by an agent or by automated tests: it needs real Phantom and Solflare wallets on a desktop extension and in a mobile in-app browser, on devnet. **The user, or someone they choose, must run `docs/testing/wallet-compat.md` and record the four result rows (and the error-shape table) before the PR is merged.** The Ship phase must not mark the PR ready while any row is empty. If a real error shape is classified wrongly by `classifyWalletError`, fix it (with a unit test row in `tests/unit/wallet-connect/errors.test.ts`) before merge.

## Plan notes

Gaps and contradictions found while writing and verifying this plan, and how each was resolved (conservatively; the architecture's intent is kept):

1. **`WalletNotConnectedError` was not matched by the specified regex.** Architecture §3.1.7 lists it under `/disconnect|not connected/i`, but the name has no space. The regex is `/disconnect|not ?connected/i`; `errors.test.ts` covers the name.
2. **`raceAbort` could leave an unhandled rejection.** When the wallet's `change` listener aborts the attempt synchronously before the wallet promise rejects (the disconnect mode), returning an already-rejected promise left the wallet promise unhandled (Vitest reported `Unhandled Errors`). `raceAbort` always attaches handlers to the wallet promise.
3. **Focus fell out of the modal when an attempt started.** The wallet list hides while in flight (architecture §3.3), so the clicked button disappears and focus lands on `<body>`; Escape then never reaches the dialog. `FlowStatus` is a focusable (`tabIndex={-1}`) polite region that takes focus when an attempt starts; a newly shown action button takes focus (this also gives the link-mode Close button the focus §3.3 asks for).
4. **The wallet menu's `aria-label` failed axe.** `accessibleLabel` as `aria-label` hid the visible truncated address from the name (`label-content-name-mismatch`, serious, WCAG 2.5.3). `MenuButton` renders `accessibleLabel` as an sr-only prefix instead, so the name is "Wallet menu AbCd…WxYz"; the menu list keeps `aria-label`. Tests match `/^Wallet menu/`.
5. **The network-enum runtime test could not import an internal.** Architecture §3.1.9 asks a test to compare `network.options` with `SOLANA_NETWORK_IDS`, but tests may import modules only through `index.ts`, and exporting the schema would widen the public surface. The compile-time `AssertEqual` guard stays, and `api-client.test.ts` instead checks that every `SOLANA_NETWORK_IDS` value parses.
6. **`Dialog` closes and returns focus in its effect cleanup.** Parents mount `ConnectWalletModal` only while it is open (so every open starts idle on `initialNetwork`); a dialog that unmounts while open must still close and return focus. Behaviour is otherwise as in architecture §3.2.
7. **`ServiceUnavailable` takes `variant: "page" | "section"`.** The sessions page renders it inside the shell's `<main>` (architecture §7.4); a second `<main>`/`<h1>` would be invalid and flagged by axe.
8. **Files beyond the architecture tree:** `src/components/app-shell/nav-entry.tsx` (one entry shared by sidebar and bottom nav), `src/components/settings-nav.tsx` (the "tiny client child using usePathname" of §4.3, placed in `components` because client code belongs there), `tests/ui/ui/date-time.test.tsx` (UTC formatting and the network indicator). `NavItem` gains `mobileLabel?` for "Home".
9. **`PageSession` is a type alias** (`type PageSession = SessionReader`) rather than an empty `interface … extends`, which the lint config rejects as an empty interface.
10. **`Card` derives its heading id from the title** instead of `useId()`, so it stays a hook-free server component.
11. **`useCountdown` resets during render** when the deadline changes (React's "adjust state on prop change" pattern) instead of calling `setState` synchronously in an effect.
12. **Copy additions not spelled out in the spec:** the wallets panel heading "Wallets", the sessions heading "Active sessions", dashboard card titles "Signed-in wallet" and "Private balances", an sr-only " wallet AbCd…WxYz" suffix on Unlink buttons and " session last seen …" on Revoke buttons (unique accessible names), the toast "Couldn't copy the address", and "No Solana wallet found in this browser." / "Continue" / "Choose an account" in the modal. None mentions privacy capability.
13. **Retries use the currently selected network** (the selector is enabled again in terminal states), with the last wallet and, except for "Start again", the last chosen account.
14. **`globals.css` hex digits are lowercase** after Prettier; the values equal the spec tokens.
15. **E2E flow 1 checks the signing preview** by holding the signature (`hang`), closing the modal, then signing in for real, because an approving wallet passes the preview state too quickly to assert on.
16. **The E2E CSP guard skips 3xx document responses** (signed-out redirects); every rendered page response must carry the nonce CSP.
17. **`bun run test:ui` exits 1 until Task 9** (Vitest's "No test files found"); `bun run test` is unaffected.
18. **Settings on mobile.** Spec §5.3 says mobile users reach Settings "from the top-bar menu", while architecture §3.3 puts a Settings link (icon + text) in the top bar and keeps the wallet menu to Copy address / Switch network / Sign out. The plan follows the architecture: the top-bar Settings link is visible at every width (the bottom nav has no Settings), so Settings is reachable from the top bar on mobile; Task 15's tests and Task 18's 320px check cover it.
