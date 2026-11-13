# GHOST WIRE — PR 02b Wallet Connect UI and App Shell: Architecture

**Date:** 2026-11-13
**Status:** Architecture phase draft, for Conductor reconciliation
**Spec (source of truth for scope):** [2026-11-13-connect-ui-design.md](2026-11-13-connect-ui-design.md). Decisions B1–B7 are closed and are not reopened here.
**Builds on:** [2026-11-13-auth-api-architecture.md](2026-11-13-auth-api-architecture.md) (PR 02a), ADRs 0001–0006
**Author role:** Frontend Engineer (lead architect for 02b)

This document fixes the *how* for the approved spec. It covers every file to create or modify, the module boundaries and the exact ESLint changes, every exported interface, the data flow per page, the backend follow-ups, the config files, the failure strategy, the test map and the spike evidence. It does not change scope. Conventions used below:

- **[decision]** marks a mechanism the spec left open.
- **[clarification]** marks a refinement of a spec statement.
- **[verified]** marks a claim that a spike checked with real code (§9).

Items that need the user's call are collected in §10.

PR 01/02a conventions that this PR keeps:

- Exact pins and the 7-day soak rule (ADR-0002).
- Nothing runs at import time. `next build` on a fresh clone without a `.env` still works. A spike confirmed this with every new file in §1 present in shape (§9.2).
- `process.env` is read only in `config`, the Next runtime files (`src/instrumentation.ts`, and now `src/proxy.ts`) and test setup/helpers/E2E support.
- `mongodb`/`bson` are imported only in `database`.
- Modules expose a public `index.ts` and a flat `internal/`. Tests import modules only through `@/modules/<name>`.

---

## 0. Dependencies (re-confirmed 2026-11-13)

Checked with `npm view <pkg> time --json` at 2026-11-13 16:00 UTC. The soak cutoff is 2026-11-06 at the same time of day. Every pin below was published on or before that cutoff, and no newer release that meets the cutoff exists.

| Package | Pin | Section | Published (UTC) | Newer releases (too new) |
|---|---|---|---|---|
| `@wallet-standard/app` | `1.1.1` | dependencies | 2026-06-03 | — |
| `@wallet-standard/base` | `1.1.1` | dependencies | 2026-06-03 | — |
| `@wallet-standard/features` | `1.1.1` | dependencies | 2026-06-03 | — **(not in spec §12, see §10 D2)** |
| `@solana/wallet-standard-features` | `1.5.0` | dependencies | 2026-09-10 | — |
| `lucide-react` | `1.70.0` | dependencies | 2026-11-06 06:15 | 1.71.0 (11-10), 1.72.0 (11-11) |
| `@fontsource-variable/inter` | `5.3.0` | dependencies | 2026-07-19 | — |
| `@fontsource-variable/space-grotesk` | `5.3.0` | dependencies | 2026-07-19 | — |
| `geist` | `1.9.2` | dependencies | 2026-11-06 10:18 | — |
| `tailwindcss` | `4.3.5` | devDependencies | 2026-11-06 15:16 | — |
| `@tailwindcss/postcss` | `4.3.5` | devDependencies | 2026-11-06 15:17 | — |
| `@testing-library/react` | `16.3.3` | devDependencies | 2026-08-27 | — |
| `@testing-library/user-event` | `14.6.8` | devDependencies | 2026-10-13 | 14.6.9 (11-10), 14.6.10 (11-12) |
| `happy-dom` | `21.0.4` | devDependencies | 2026-10-20 | — |
| `@playwright/test` | `1.65.0` | devDependencies | 2026-11-05 | — |
| `@axe-core/playwright` | `4.14.0` | devDependencies | 2026-10-15 | — |

- `lucide-react`, `geist` and both Tailwind packages are exactly 7 days old on 2026-11-13. They passed the cutoff earlier the same day, so they qualify.
- `geist` has a peer dependency on `next >=13.2.0`, which is satisfied. Only its font files are used (§6.6), never its `next/font` wrappers.
- `@wallet-standard/features` is already in the tree as a transitive dependency of `@solana/wallet-standard-features`. `wallet-connect` imports `StandardConnect`, `StandardEvents` and their types from it, so it should be a direct, pinned dependency rather than a hoisting accident (§10 D2).
- **Not added:** `@vitejs/plugin-react` (not needed, [verified] §9.5), `@testing-library/jest-dom` (assertions use plain DOM APIs), `@solana/web3.js`, `@solana/kit`, `@solana/wallet-adapter-*`, Radix/shadcn, `server-only`, analytics, CSS-in-JS.

Client-side response validation uses `zod/mini`, which ships inside the already pinned `zod` 4.6.7 **[decision]**. Its parse methods are the same and its client bundle is much smaller. Non-strict `z.object` strips unknown keys, so a server that adds a field does not break the client ([verified] §9.8).

---

## 1. Directory tree (every file created or modified)

`A` = added, `M` = modified. Nothing else changes.

```text
.gitignore                                            M  + playwright-report/, test-results/
.prettierignore                                       M  + playwright-report/, test-results/
README.md                                             M  + "UI development" and "End-to-end tests" sections, scripts table rows
bun.lock                                              M
eslint.config.mjs                                     M  §2.2
next.config.ts                                        M  §6.4 (static security headers + API CSP)
package.json                                          M  §0 pins, §6.5 scripts
playwright.config.ts                                  A  §6.3
postcss.config.mjs                                    A  §6.1
tsconfig.json                                         M  §6.6 (include tests/**/*.tsx)
vitest.config.ts                                      M  §6.2 (project "ui")
docs/adr/0007-frontend-stack-wallet-connection.md     A  records B2, B3, B4 + CSP nonce mechanism
docs/specs/2026-11-13-connect-ui-architecture.md      A  this document
docs/testing/wallet-compat.md                         A  manual Phantom/Solflare checklist + results table
src/
  csp.ts                                              A  createNonce, buildContentSecurityPolicy (pure)
  proxy.ts                                            A  Next 16 proxy: per-request nonce CSP on page routes
  app/
    layout.tsx                                        M  connection(), fonts, globals.css, SkipLink, ToastProvider
    globals.css                                       A  @import "tailwindcss"; @theme tokens; base + reduced motion
    fonts.ts                                          A  next/font/local: Inter, Space Grotesk, Geist Mono
    page.tsx                                          M  landing hero (server, signed-in-aware CTA)
    error.tsx                                         A  root error boundary (client)
    not-found.tsx                                     A  styled 404
    _server/
      shell-state.ts                                  A  loadShellState(): React cache() over cookies → resolvePageSession → getMe
    (app)/
      layout.tsx                                      A  signed-out → redirect("/"); unavailable → ServiceUnavailable; else AppShell
      error.tsx                                       A  (app) error boundary (client)
      dashboard/page.tsx                              A
      settings/layout.tsx                             A  settings sub-nav (Wallets | Sessions)
      settings/page.tsx                               A  redirect("/settings/wallets")
      settings/wallets/page.tsx                       A
      settings/sessions/page.tsx                      A
    api/v1/auth/verify/route.ts                       M  passes previousToken to verifySignIn (§5.3)
  modules/
    shared/internal/http.ts                           M  toErrorResponse log levels (§5.1)
    security/internal/events.ts                       M  SECURITY_REASONS += "replaced" (§5.3)
    auth/
      index.ts                                        M  new exports (§3.5)
      internal/cookies.ts                             M  + parseSessionTokenValue, carriesSessionCookie (§5.2)
      internal/wrappers.ts                            M  withSession clears a stale cookie on 401 (§5.2)
      internal/sessions.ts                            M  resolveSession(token, at, { slide }) + replaceSession (§5.3, §5.4)
      internal/sign-in.ts                             M  verifySignIn(body, meta, { previousToken }) (§5.3)
      internal/account.ts                             M  getMe/listWallets take SessionReader (§3.5)
      internal/session-management.ts                  M  listSessions takes SessionReader (§3.5)
      internal/types.ts                               M  + SessionReader, PageSession, CookieReader
      internal/page-session.ts                        A  resolvePageSession(cookies) (§3.5)
    wallet-connect/                                   client-only module
      index.ts                                        A
      internal/features.ts                            A  typed feature accessors (connect, events, signMessage)
      internal/registry.ts                            A  listSolanaWallets, subscribeWallets, refreshWallets
      internal/use-wallets.ts                         A  useWallets() over useSyncExternalStore
      internal/flow.ts                                A  FlowState, FlowEvent, reduce, initialFlowState, toFailureCode
      internal/run-flow.ts                            A  runFlow driver
      internal/use-connect-flow.ts                    A  useConnectFlow hook (reducer + driver + abort + account picker)
      internal/errors.ts                              A  classifyWalletError
      internal/challenge-preview.ts                   A  parseChallengePreview (checks domain, address, network)
      internal/provider-id.ts                         A  toProviderId(walletName)
      internal/api-client.ts                          A  typed /api/v1 client, ApiResult, onUnauthenticated
      internal/schemas.ts                             A  zod/mini response schemas + inferred types
      internal/base58.ts                              A  encodeBase58 (second and last bs58 import)
  ui/                                                 primitives, no domain logic
    cn.ts                                             A  class joiner
    button.tsx                                        A
    card.tsx                                          A
    badge.tsx                                         A
    spinner.tsx                                       A
    dialog.tsx                                        A
    confirm-dialog.tsx                                A
    toast.tsx                                         A  ToastProvider, useToast, live regions
    address.tsx                                       A  Address, truncateAddress
    date-time.tsx                                     A  DateTime (deterministic UTC formatting)
    network-indicator.tsx                             A  NetworkIndicator, networkLabel
    menu.tsx                                          A  MenuButton (WAI-ARIA menu button)
    segmented-control.tsx                             A  native radio group styled as segments
    wallet-status.tsx                                 A  address menu: Copy address, Switch network, Sign out
    ghost-logo.tsx                                    A  text wordmark
    skip-link.tsx                                     A
  components/                                         feature components (ui + wallet-connect)
    app-shell/app-shell.tsx                           A  server component: TopBar + Sidebar + BottomNav + SessionExpiredHandler
    app-shell/top-bar.tsx                             A  client
    app-shell/sidebar.tsx                             A  client (usePathname)
    app-shell/bottom-nav.tsx                          A  client (usePathname)
    app-shell/nav-items.ts                            A  NAV_ITEMS (shared by sidebar and bottom nav)
    connect-button.tsx                                A  button + lazily loaded modal
    connect-wallet-modal.tsx                          A
    connect-wallet-copy.ts                            A  pure: flow state → copy + action
    wallet-list.tsx                                   A  modal's wallet list / empty state
    account-picker.tsx                                A  modal's account picker
    flow-status.tsx                                   A  modal's status region (copy, preview, retry, countdown)
    use-countdown.ts                                  A  seconds-left hook for rate-limited state
    use-fresh-navigation.ts                           A  replace(path) then refresh()
    panel-copy.ts                                     A  pure: ApiResult error → panel copy
    wallets-panel.tsx                                 A
    sessions-panel.tsx                                A
    session-expired-handler.tsx                       A
    service-unavailable.tsx                           A
tests/
  setup/ui.setup.ts                                   A  RTL cleanup afterEach
  helpers/fake-wallet.ts                              A  in-memory Wallet Standard wallet, scripted modes
  helpers/fake-api.ts                                 A  fetch stub routing /api/v1 calls
  helpers/next-navigation.ts                          A  shared next/navigation mock state
  fixtures/lint/client-imports-server.ts              A
  fixtures/lint/server-imports-client.ts              A
  fixtures/lint/next-server-imports.ts                A
  fixtures/lint/ui-imports-feature.ts                 A
  fixtures/lint/bs58-import.ts                        A
  fixtures/lint/client-component.tsx                  A
  unit/lint/boundaries.test.ts                        M  §2.4
  unit/shared/http.test.ts                            M  §5.1 log levels
  unit/auth/cookies.test.ts                           M  parseSessionTokenValue, carriesSessionCookie
  unit/csp.test.ts                                    A
  unit/components/connect-wallet-copy.test.ts         A
  unit/components/panel-copy.test.ts                  A
  unit/wallet-connect/flow.test.ts                    A
  unit/wallet-connect/errors.test.ts                  A
  unit/wallet-connect/registry.test.ts                A
  unit/wallet-connect/api-client.test.ts              A
  unit/wallet-connect/run-flow.test.ts                A
  unit/wallet-connect/challenge-preview.test.ts       A
  unit/wallet-connect/provider-id.test.ts             A
  unit/wallet-connect/base58.test.ts                  A
  ui/ui/button.test.tsx                               A
  ui/ui/dialog.test.tsx                               A
  ui/ui/confirm-dialog.test.tsx                       A
  ui/ui/toast.test.tsx                                A
  ui/ui/address.test.tsx                              A
  ui/ui/menu.test.tsx                                 A
  ui/ui/segmented-control.test.tsx                    A
  ui/ui/spinner.test.tsx                              A
  ui/wallet-connect/use-wallets.test.tsx              A
  ui/wallet-connect/use-connect-flow.test.tsx         A
  ui/components/connect-wallet-modal.test.tsx         A
  ui/components/wallets-panel.test.tsx                A
  ui/components/sessions-panel.test.tsx               A
  ui/components/app-nav.test.tsx                      A  sidebar + bottom nav semantics
  ui/components/top-bar.test.tsx                      A
  ui/components/session-expired-handler.test.tsx      A
  ui/components/service-unavailable.test.tsx          A
  integration/routes/v1/log-levels.test.ts            A  §7.1
  integration/routes/v1/stale-cookie.test.ts          A  §7.2
  integration/routes/v1/session-replace.test.ts       A  §7.3
  integration/auth/resolve-session-slide.test.ts      A  §7.4
  integration/auth/page-session.test.ts               A  resolvePageSession
  e2e/support/origin.ts                               A  E2E_PORT, E2E_ORIGIN
  e2e/support/global-setup.ts                         A  MongoMemoryReplSet + next build + next start
  e2e/support/keys.ts                                 A  createE2eKey (node:crypto + bs58)
  e2e/support/test-wallet.ts                          A  installTestWallets (serialized into the page)
  e2e/support/fixtures.ts                             A  test.extend: wallets, guards (privacy + CSP), axe helper
  e2e/sign-in.spec.ts                                 A  flows 1–3
  e2e/network-switch.spec.ts                          A  flow 4
  e2e/wallets.spec.ts                                 A  flow 5
  e2e/sessions.spec.ts                                A  flow 6
  e2e/guards.spec.ts                                  A  flow 7
  e2e/mobile.spec.ts                                  A  flow 8
  e2e/a11y.spec.ts                                    A  axe on every page and dialog state
```

**[clarification] Files beyond the spec §4 sketch.** `features.ts`, `use-connect-flow.ts`, `challenge-preview.ts` and `provider-id.ts` in `wallet-connect`; `menu.tsx`, `segmented-control.tsx`, `confirm-dialog.tsx`, `date-time.tsx` and `cn.ts` in `ui`; and the extra component files keep each file focused. `src/csp.ts` and `src/proxy.ts` exist because the CSP spike showed a nonce is required (§6.4).

---

## 2. Module boundaries and ESLint

### 2.1 Layering **[decision]**

```text
src/app/**  ─────────────►  @/components/*  ──►  @/ui/*
   │                              │
   │                              └──────────►  @/modules/wallet-connect  ──►  @/modules/validation (types only in practice)
   └──► server modules (@/modules/{auth,config,shared,security,...})
```

- **Client code** = `src/modules/wallet-connect/**`, `src/ui/**` and `src/components/**`. Among modules it may import **only** `@/modules/validation` and `@/modules/wallet-connect` **[decision, stricter than spec rule 1]**. The spec forbids `database`, `auth`, `security` and `config`. `wallet` (which imports `database`) and `shared` (logger, `process.stdout`) would drag server code into the client bundle the same way, so the rule lists what is allowed instead. `wallet-connect` actually imports only `import type { SolanaNetwork } from "@/modules/validation"`.
- **Server modules** = every module except `wallet-connect`. They must not import `@/modules/wallet-connect`, `@/ui/*` or `@/components/*`. The spec lists seven modules. The rule applies to all of them, including the `blockchain`, `payments` and `privacy` placeholders, because those are server modules too.
- **`next/headers` and the server functions of `next/navigation`** (`redirect`, `permanentRedirect`, `notFound`, `forbidden`, `unauthorized`) are allowed only in `src/app/**` and the root runtime files. The spec names `redirect`/`notFound`; the other three are the same kind of render-time throw **[clarification]**. Client hooks (`useRouter`, `usePathname`) stay allowed everywhere in client code.
- `src/ui/**` must not import `@/modules/wallet-connect` or `@/components/*`. `wallet-connect` must not import `@/ui/*` or `@/components/*` either (a module never imports the UI).
- `bs58` is imported only by `src/modules/wallet/internal/base58.ts` and `src/modules/wallet-connect/internal/base58.ts`. Tests, helpers and E2E support keep their exemption.

Server components pass plain, serializable props to client components. Client components describe those props with the `wallet-connect` schema types (`MeData`, `WalletItem`, `SessionItem`). The page under `src/app` that passes an `auth` `MeView` into a client prop is where TypeScript checks the two shapes are structurally compatible. No client file imports `@/modules/auth`, not even for types.

### 2.2 `eslint.config.mjs` changes (exact)

**Parser:** no change. `eslint-config-next/typescript` assigns `@typescript-eslint/parser` to `**/*.{ts,tsx}`, and that parser enables JSX by file extension. A `.tsx` fixture with JSX lints without a fatal error ([verified] §9.8).

Global ignores gain `"playwright-report/**"` and `"test-results/**"`.

**New messages** (added to `MESSAGES`):

```js
clientServer:
  "Client code (wallet-connect, ui, components) may import only '@/modules/validation' and '@/modules/wallet-connect' among modules.",
clientNode: "Client code (wallet-connect, ui, components) must not import 'node:*'.",
serverClient: "Server modules must not import '@/modules/wallet-connect', '@/ui/*' or '@/components/*'.",
nextServer: "Only src/app/** may import next/headers or the server functions of next/navigation.",
uiLayer: "src/ui/** must not import '@/modules/wallet-connect' or '@/components/*'.",
bs58: "Only wallet/internal/base58.ts and wallet-connect/internal/base58.ts may import 'bs58'.",
```

**New regexes and atoms** (after the existing atoms; `dynamicSelectors` is reused unchanged, and esquery accepts the lookahead, [verified] §9.8):

```js
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
```

**Scope array** (replaces `const SRC …` through the end of `boundaryScopes`; `scope()` itself is unchanged). The disjointness invariant from the PITFALL comment is preserved: every file matches exactly one boundary scope. `wallet-connect` is carved out of S7–S9b the same way `database` and `config` are, and each `base58.ts` gets its own one-file scope.

```js
const SRC = { noConsole: true };
const WC = "src/modules/wallet-connect";
/** Modules with their own scopes; excluded from the generic module scopes S7-S9b. */
const SPECIAL_MODULES = ["src/modules/{database,config,wallet-connect}/**"];
/** The two files allowed to import bs58; each has its own scope (S8a, S14a). */
const BS58_FILES = ["src/modules/wallet/internal/base58.ts", `${WC}/internal/base58.ts`];
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
  scope(["src/app/**/*.{ts,tsx}", "src/*.{ts,tsx}"], ["src/instrumentation.ts", "src/proxy.ts"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R6_BS58], SRC),
  // S2 Next runtime files: process.env allowed
  scope(["src/instrumentation.ts", "src/proxy.ts"], [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R6_BS58], SRC),
  // S0 catch-all for any other src file (src/lib, ...): base rules
  scope(["src/**/*.{ts,tsx}"],
    ["src/app/**", "src/*.{ts,tsx}", "src/modules/**", "src/ui/**", "src/components/**"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_NEXT_SERVER, R6_BS58], SRC),
  // S3/S4 database: mongodb allowed
  scope(["src/modules/database/*.{ts,tsx}"], [], [R1_DEEP, R1_ESCAPE_1, R2_APP, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/database/internal/*.{ts,tsx}"], [], [R1_DEEP, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER], SRC),
  // S5/S6 config: process.env allowed
  scope(["src/modules/config/*.{ts,tsx}"], [], [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, ...SERVER], SRC),
  scope(["src/modules/config/internal/*.{ts,tsx}"], [], [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER], SRC),
  // S7/S8 every other server module (auth, wallet, security, shared, validation, placeholders)
  scope(["src/modules/*/*.{ts,tsx}"], SPECIAL_MODULES,
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/*/internal/*.{ts,tsx}"], [...SPECIAL_MODULES, ...BS58_FILES],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER], SRC),
  // S8a wallet/internal/base58.ts: S8 minus R6
  scope(["src/modules/wallet/internal/base58.ts"], [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_SERVER_CLIENT, R5_NEXT_SERVER], SRC),
  // S9 nested internal directories are forbidden outright (and still get the module rules)
  scope(["src/modules/*/internal/*/**/*.{ts,tsx}"], SPECIAL_MODULES,
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/database/internal/*/**/*.{ts,tsx}"], [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/config/internal/*/**/*.{ts,tsx}"], [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, ...SERVER], SRC),
  // S9b catch-all for any other file under src/modules
  scope(["src/modules/**/*.{ts,tsx}"], [...MODULE_SCOPED_FILES, ...SPECIAL_MODULES],
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/database/**/*.{ts,tsx}"], MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER], SRC),
  scope(["src/modules/config/**/*.{ts,tsx}"], MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER], SRC),
  // S13/S14/S15/S16 wallet-connect: the client module (S7-S9b shapes, CLIENT atoms instead of SERVER)
  scope([`${WC}/*.{ts,tsx}`], [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT], SRC),
  scope([`${WC}/internal/*.{ts,tsx}`], [`${WC}/internal/base58.ts`],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT], SRC),
  // S14a wallet-connect/internal/base58.ts: S14 minus R6
  scope([`${WC}/internal/base58.ts`], [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, R5_CLIENT_SERVER, R5_CLIENT_NODE, R5_NEXT_SERVER], SRC),
  scope([`${WC}/internal/*/**/*.{ts,tsx}`], [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT], SRC),
  scope([`${WC}/**/*.{ts,tsx}`], MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT], SRC),
  // S17 ui primitives: client, and the bottom layer
  scope(["src/ui/**/*.{ts,tsx}"], [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT], SRC),
  // S18 feature components: client (may use ui and wallet-connect)
  scope(["src/components/**/*.{ts,tsx}"], [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, ...CLIENT], SRC),
  // S10 unit tests
  scope(["tests/unit/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S10a component tests (happy-dom)
  scope(["tests/ui/**/*.{ts,tsx}"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S11 integration tests: mongodb allowed
  scope(["tests/integration/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R4_ENV]),
  // S12 test setup, helpers and E2E: process.env allowed
  scope(["tests/setup/**/*.{ts,tsx}", "tests/helpers/**/*.{ts,tsx}", "tests/e2e/**/*.ts"], [],
    [R1_DEEP, R1_REL_INTO_MODULES]),
];
```

Notes:

- The `[R1_DEEP, R1_ESCAPE_x, …]` atoms are listed in the same order as today, so Prettier output stays stable. Run Prettier on the file; the scratch spike formatted and linted it cleanly.
- `src/proxy.ts` joins `src/instrumentation.ts` in S2 because it reads `process.env.NODE_ENV` (a Next runtime file, the same exception).
- `src/app/_server/*.ts`, `src/csp.ts` and `src/app/fonts.ts` fall under S1.
- Root config files (`playwright.config.ts`, `postcss.config.mjs`) stay unscoped, as before.
- The comment above S7 is updated to: "These globs cover every server module except database, config and wallet-connect, which have their own scopes."

### 2.3 Lint fixtures (new files under `tests/fixtures/lint/`)

`client-imports-server.ts`
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

`server-imports-client.ts`
```ts
import { useWallets } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
import { AppShell } from "@/components/app-shell/app-shell";
export const probe = [useWallets, Button, AppShell];
```

`next-server-imports.ts`
```ts
import { cookies } from "next/headers";
import { notFound, redirect, useRouter } from "next/navigation";
export const lazy = () => import("next/headers");
export const probe = [cookies, notFound, redirect, useRouter];
```

`ui-imports-feature.ts`
```ts
import { useWallets } from "@/modules/wallet-connect";
import { ConnectButton } from "@/components/connect-button";
export const probe = [useWallets, ConnectButton];
```

`bs58-import.ts`
```ts
import bs58 from "bs58";
export const lazy = () => import("bs58");
export const probe = bs58;
```

`client-component.tsx` (JSX parse check and the allowed client imports)
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

`tsconfig.json` already excludes `tests/fixtures/**`, and ESLint globally ignores it, so the `.tsx` fixture is never type-checked or linted except through `lintText`.

### 2.4 Boundary test cases (`tests/unit/lint/boundaries.test.ts`)

`MSG` gains `clientServer`, `clientNode`, `serverClient`, `nextServer`, `uiLayer` and `bs58` (the same strings as §2.2). New cases are appended under a `// --- PR 02b ---` comment. Every row below matches the spike output exactly ([verified] §9.8).

| Fixture | Virtual path | Expected `[line, rule, MSG]` |
|---|---|---|
| `client-imports-server.ts` | `src/modules/wallet-connect/internal/__lint__.ts` | `[1,IMPORTS,clientServer] [2,IMPORTS,mongodb] [3,IMPORTS,clientNode] [4,IMPORTS,clientServer] [6,SYNTAX,clientServer]` |
| `client-imports-server.ts` | `src/ui/__lint__.tsx` | same five |
| `client-imports-server.ts` | `src/components/__lint__.tsx` | same five |
| `server-imports-client.ts` | `src/modules/auth/internal/__lint__.ts` | `[1,IMPORTS,serverClient] [2,IMPORTS,serverClient] [3,IMPORTS,serverClient]` |
| `server-imports-client.ts` | `src/modules/database/internal/__lint__.ts` | same three |
| `server-imports-client.ts` | `src/modules/config/__lint__.ts` | same three |
| `server-imports-client.ts` | `src/app/__lint__/ok.tsx` | `[]` |
| `next-server-imports.ts` | `src/components/__lint__.tsx` | `[1,IMPORTS,nextServer] [2,IMPORTS,nextServer] [3,SYNTAX,nextServer]` (line 2 reports twice, once each for redirect and notFound, both with the same message; `useRouter` is not reported) |
| `next-server-imports.ts` | `src/ui/__lint__.tsx` | same |
| `next-server-imports.ts` | `src/modules/wallet-connect/internal/__lint__.ts` | same |
| `next-server-imports.ts` | `src/modules/auth/internal/__lint__.ts` | same |
| `next-server-imports.ts` | `src/app/(app)/__lint__.tsx` | `[]` |
| `ui-imports-feature.ts` | `src/ui/__lint__.tsx` | `[1,IMPORTS,uiLayer] [2,IMPORTS,uiLayer]` |
| `ui-imports-feature.ts` | `src/components/__lint__.tsx` | `[]` |
| `bs58-import.ts` | `src/modules/wallet/internal/base58.ts` | `[]` |
| `bs58-import.ts` | `src/modules/wallet-connect/internal/base58.ts` | `[]` |
| `bs58-import.ts` | `src/modules/wallet/internal/address.ts` | `[1,IMPORTS,bs58] [2,SYNTAX,bs58]` |
| `bs58-import.ts` | `src/modules/wallet-connect/internal/run-flow.ts` | same |
| `bs58-import.ts` | `src/components/__lint__.tsx` | same |
| `bs58-import.ts` | `src/app/__lint__/x.ts` | same |
| `bs58-import.ts` | `tests/helpers/__lint__.ts` | `[]` |
| `client-component.tsx` | `src/components/__lint__.tsx` | `[]` (no fatal parse error) |
| `nested-internal.ts` | `src/modules/wallet-connect/internal/sub/__lint__.ts` | `[1,SYNTAX,flat]` |
| `allowed-config.ts` | `src/modules/wallet-connect/internal/__lint__.ts` | `[1,PROPS,env]` |
| `console-call.ts` | `src/ui/__lint__.tsx` | `[1,CONSOLE,console]` |
| `deep-import.ts` | `tests/ui/__lint__.test.tsx` | `[1,IMPORTS,deep]` |
| `env-outside-config.ts` | `src/proxy.ts` | `[]` |
| `env-outside-config.ts` | `tests/e2e/__lint__.spec.ts` | `[]` |

Do not use `env-outside-config.ts` under a client path. Its line 1 imports from `node:process`, so it would report two different messages on one `(line, rule)` key, which the test's per-key message check rejects. The `allowed-config.ts` row covers R4 in client code instead.

All 28 existing cases keep passing with the new config ([verified] §9.8). `bun run lint` over the existing `src/` and `tests/` reports zero problems.

---

## 3. Interfaces

### 3.1 `@/modules/wallet-connect` public `index.ts`

```ts
export { listSolanaWallets, refreshWallets, subscribeWallets } from "./internal/registry";
export type { WalletEntry } from "./internal/registry";
export { useWallets } from "./internal/use-wallets";
export { initialFlowState, isInFlight, reduce, toFailureCode } from "./internal/flow";
export type {
  AccountOption, FlowEvent, FlowFailureCode, FlowMode, FlowState, FlowStatus, SignPreview,
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
  apiClient, challenge, linkChallenge, linkVerify, listSessions, listWallets, logout, me,
  onUnauthenticated, revokeSession, unlinkWallet, verify,
} from "./internal/api-client";
export type { ApiClient, ApiFailure, ApiResult, RequestOptions } from "./internal/api-client";
export type {
  ChallengeData, LinkData, MeData, SessionItem, SignInData, WalletItem,
} from "./internal/schemas";
```

No file in this module has a `"use client"` directive. Directives belong on the component entry points in `src/components` and `src/ui`. The module is client-only by the lint layering and by usage.

#### 3.1.1 `features.ts`

```ts
import type { Wallet } from "@wallet-standard/base";
import { StandardConnect, StandardEvents, type StandardConnectFeature, type StandardEventsFeature } from "@wallet-standard/features";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";

export type ConnectFeature = StandardConnectFeature[typeof StandardConnect];        // { version; connect(input?) }
export type EventsFeature = StandardEventsFeature[typeof StandardEvents];           // { version; on("change", l) => off }
export type SignMessageFeature = SolanaSignMessageFeature[typeof SolanaSignMessage]; // { version: "1.0.0"|"1.1.0"; signMessage(...inputs) }

/** The feature object when present and its method is a function; otherwise null. Never throws. */
export function getConnect(wallet: Wallet): ConnectFeature | null;      // checks typeof .connect === "function"
export function getEvents(wallet: Wallet): EventsFeature | null;        // checks typeof .on === "function"
export function getSignMessage(wallet: Wallet): SignMessageFeature | null; // checks typeof .signMessage === "function"
export function hasSolanaChain(wallet: Wallet): boolean;                 // wallet.chains.some(c => c.startsWith("solana:"))
```

Installed API shapes ([verified] §9.1):
- `connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>`
- `on<"change">(event, listener: (p: { chains?; features?; accounts? }) => void): () => void`
- `signMessage(...inputs: readonly { account: WalletAccount; message: Uint8Array }[]): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array; signatureType?: "ed25519" }[]>`

#### 3.1.2 `registry.ts`

```ts
import type { Wallet, WalletIcon } from "@wallet-standard/base";

export interface WalletEntry {
  /** Stable per Wallet object for the page lifetime: "w1", "w2", … (WeakMap<Wallet, string>). */
  readonly id: string;
  readonly name: string;
  readonly icon: WalletIcon;          // data: URI (allowed by img-src 'self' data:)
  readonly canSignIn: boolean;
  readonly wallet: Wallet;
}

/** Cached snapshot. Same array identity until a register/unregister event or refreshWallets(). */
export function listSolanaWallets(): readonly WalletEntry[];
/** Subscribes to getWallets() "register" and "unregister". Returns the unsubscribe function. */
export function subscribeWallets(listener: () => void): () => void;
/** Rebuilds the snapshot from getWallets().get() and notifies listeners (empty-state Refresh button). */
export function refreshWallets(): void;
```

Rules **[clarification]**:
- A wallet is **listed** when `hasSolanaChain(wallet)` is true, or when any key of `wallet.features` starts with `"solana:"`. Wallets with neither (for example an EVM-only Wallet Standard wallet) are not listed.
- `canSignIn = getConnect(w) !== null && getSignMessage(w) !== null && hasSolanaChain(w)`. A listed wallet without `solana:signMessage` has `canSignIn: false`.
- Order: `canSignIn` first, then registration order.
- `getWallets()` is called lazily, on the first `listSolanaWallets`/`subscribeWallets` call, never at import time. In Node (unit tests) `getWallets()` returns the registry without window listeners, and `register()` still works ([verified] §9.1, read from `@wallet-standard/app/src/wallets.ts`).
- The `@wallet-standard/app` registry is a module-level singleton. Unit tests must call the `unregister` that `register()` returns in `afterEach`.

#### 3.1.3 `use-wallets.ts`

```ts
/** useSyncExternalStore(subscribeWallets, listSolanaWallets, () => EMPTY). EMPTY is a frozen [] constant. */
export function useWallets(): readonly WalletEntry[];
```

The server snapshot is `[]`, so SSR and the first hydration render show the "looking for wallets" state, and the store's client snapshot follows after hydration. Late `register` events re-render.

#### 3.1.4 `flow.ts` — states, events, transition table

```ts
import type { SolanaNetwork } from "@/modules/validation";

export type FlowMode = "sign-in" | "link";
export interface AccountOption { readonly address: string; readonly label: string | null }
export interface SignPreview { readonly domain: string; readonly address: string; readonly network: SolanaNetwork }
export type FlowFailureCode =
  | "AUTH_FAILED" | "WALLET_ALREADY_LINKED" | "NETWORK_UNSUPPORTED" | "UNREACHABLE" | "OTHER";

interface Base { readonly attemptId: number }
export type FlowState =
  | (Base & { readonly status: "idle" })
  | (Base & { readonly status: "connecting"; readonly walletName: string })
  | (Base & { readonly status: "choosing-account"; readonly walletName: string; readonly accounts: readonly AccountOption[] })
  | (Base & { readonly status: "challenging"; readonly address: string })
  | (Base & { readonly status: "awaiting-signature"; readonly preview: SignPreview })
  | (Base & { readonly status: "verifying"; readonly address: string })
  | (Base & { readonly status: "done"; readonly address: string; readonly network: SolanaNetwork })
  | (Base & { readonly status: "rejected" })
  | (Base & { readonly status: "disconnected" })
  | (Base & { readonly status: "account-changed" })
  | (Base & { readonly status: "rate-limited"; readonly retryAt: number })            // epoch ms
  | (Base & { readonly status: "failed"; readonly code: FlowFailureCode; readonly message: string });
export type FlowStatus = FlowState["status"];

export type FlowEvent =
  | { readonly type: "start"; readonly attemptId: number; readonly walletName: string }
  | { readonly type: "choose-account"; readonly attemptId: number; readonly accounts: readonly AccountOption[] }
  | { readonly type: "account-selected"; readonly attemptId: number; readonly address: string }
  | { readonly type: "challenge-issued"; readonly attemptId: number; readonly preview: SignPreview }
  | { readonly type: "signed"; readonly attemptId: number }
  | { readonly type: "verified"; readonly attemptId: number; readonly address: string; readonly network: SolanaNetwork }
  | { readonly type: "wallet-error"; readonly attemptId: number; readonly kind: "rejected" | "disconnected" | "other" }
  | { readonly type: "api-error"; readonly attemptId: number; readonly code: string; readonly message: string; readonly retryAt?: number }
  | { readonly type: "account-changed"; readonly attemptId: number }
  | { readonly type: "reset" };

export const initialFlowState: FlowState; // { status: "idle", attemptId: 0 }
/** connecting | choosing-account | challenging | awaiting-signature | verifying */
export function isInFlight(state: FlowState): boolean;
/** AUTH_FAILED, WALLET_ALREADY_LINKED, NETWORK_UNSUPPORTED kept; DEPENDENCY_UNAVAILABLE and NETWORK → UNREACHABLE; anything else → OTHER. */
export function toFailureCode(apiCode: string): FlowFailureCode;
/** Pure and total. An unlisted (state, event) pair returns the SAME state object. */
export function reduce(state: FlowState, event: FlowEvent): FlowState;
```

**[clarification]** The spec's state list has no account-picker state, but §5.2 requires a picker. `choosing-account` fills that gap. Preview and address data live on the states that render them.

**Stale-attempt rule.** For every event except `start` and `reset`, `event.attemptId !== state.attemptId` returns `state` unchanged. `start` is accepted only when `event.attemptId > state.attemptId`. Attempt ids are strictly increasing and come from the hook's counter.

**Transition table** (`*` = any status; every unlisted pair returns `state` unchanged):

| From | Event | To |
|---|---|---|
| `*` | `start` (id > current) | `connecting { attemptId: e.attemptId, walletName }` |
| `connecting` | `choose-account` | `accounts.length >= 2` → `choosing-account { walletName, accounts }`; otherwise `failed { code: "OTHER", message: "no accounts" }` |
| `connecting` | `account-selected` | `challenging { address }` |
| `choosing-account` | `account-selected` (address ∈ accounts) | `challenging { address }` (an address not in the list returns state unchanged) |
| `challenging` | `challenge-issued` | `awaiting-signature { preview }` |
| `awaiting-signature` | `signed` | `verifying { address: preview.address }` |
| `verifying` | `verified` | `done { address, network }` |
| `connecting`, `choosing-account`, `challenging`, `awaiting-signature` | `wallet-error` | `rejected` / `disconnected` / `failed { code: "OTHER", message: "wallet error" }` by `kind` |
| `challenging`, `verifying` | `api-error` with `code === "RATE_LIMITED"` and `retryAt` set | `rate-limited { retryAt }` |
| `challenging`, `verifying` | `api-error` (any other) | `failed { code: toFailureCode(code), message }` |
| `choosing-account`, `challenging`, `awaiting-signature` | `account-changed` | `account-changed` |
| `*` | `reset` | `idle { attemptId: state.attemptId }` |

Wallet events are deliberately not accepted in `verifying`. Once the signature has been produced, the server may already be creating the session, so a late disconnect must not show "disconnected" while a session cookie is being set. The driver also stops listening to `change` after signing (§3.1.5).

#### 3.1.5 `run-flow.ts` — the driver

```ts
export interface FlowApi {
  challenge: ApiClient["challenge"];
  verify: ApiClient["verify"];
  linkChallenge: ApiClient["linkChallenge"];
  linkVerify: ApiClient["linkVerify"];
}

export interface RunFlowOptions {
  readonly mode: FlowMode;
  readonly entry: WalletEntry;
  readonly network: SolanaNetwork;
  readonly attemptId: number;
  readonly signal: AbortSignal;                      // aborted when the modal closes or a new attempt starts
  readonly dispatch: (event: FlowEvent) => void;
  readonly api: FlowApi;
  /** window.location.host in the browser; the challenge message's domain must equal it. */
  readonly expectedDomain: string;
  /** Skips the picker when this address is among the connected accounts (retry keeps the user's choice). */
  readonly preferredAddress?: string;
  /** Resolves with the chosen address; rejects with an AbortError when signal aborts. */
  readonly selectAccount: (accounts: readonly AccountOption[], signal: AbortSignal) => Promise<string>;
  /** Default Date.now; used only for retryAt. */
  readonly now?: () => number;
}

/** Never rejects. Dispatches only for its own attemptId and never after its signal aborted. */
export function runFlow(options: RunFlowOptions): Promise<void>;
```

**[clarification]** The spec's `runFlow({ …, wallet, account? … })` becomes `entry` and `preferredAddress`, plus `selectAccount` for the picker, so that the driver stays one linear async function.

Sequence. "Stop" means return without dispatching. Each `await` on a wallet promise goes through `raceAbort(promise, signal)`, which rejects with an `AbortError` as soon as `signal` aborts. A hung wallet promise therefore never blocks cancellation.

1. `dispatch({ type: "start", attemptId, walletName: entry.name })`.
2. Create an internal `AbortController` linked to `signal` through an `abort` listener. `AbortSignal.any` is not used. Call it `sig`.
3. If `getEvents(entry.wallet)` exists, subscribe to `change`. Let `selected` be the address chosen in step 6, and `signedYet` a flag. The listener ignores the event when `signedYet` is true or `p.accounts === undefined`. If `p.accounts.length === 0`, it dispatches `wallet-error {kind:"disconnected"}` and aborts `sig`. If `selected !== null` and no account in `p.accounts` has that address, it dispatches `account-changed` and aborts `sig`.
4. `connect()` via `getConnect`. On a throw: if `sig.aborted`, stop. Otherwise dispatch `wallet-error { kind: classifyWalletError(e) }` and stop.
5. Accounts are `output.accounts`, falling back to `entry.wallet.accounts`, deduplicated by `address`. If there are none, dispatch `wallet-error {kind:"other"}` and stop.
6. Pick: `preferredAddress` if present, else the only account, else dispatch `choose-account { accounts }` and `await raceAbort(selectAccount(options, sig), sig)`. Then dispatch `account-selected { address }` and set `selected`.
7. `(mode === "sign-in" ? api.challenge : api.linkChallenge)({ address, network }, { signal: sig })`. If `sig.aborted`, stop. On `!ok`, dispatch `api-error { code, message, retryAt: code === "RATE_LIMITED" ? now() + (retryAfter ?? 60) * 1000 : undefined }` and stop.
8. `preview = parseChallengePreview(data.message, { address, network, domain: expectedDomain })`. If it is `null`, dispatch `api-error { code: "UNEXPECTED_RESPONSE", message: "challenge mismatch" }` and stop.
9. `dispatch({ type: "challenge-issued", preview })`.
10. `signMessage({ account: <the WalletAccount object for address>, message: new TextEncoder().encode(data.message) })`. On a throw: if `sig.aborted`, stop; otherwise dispatch `wallet-error` by classification and stop. If `outputs[0]?.signature.length !== 64`, dispatch `wallet-error {kind:"other"}` and stop.
11. Set `signedYet = true`, unsubscribe from `change`, and `dispatch({ type: "signed" })`.
12. `(mode === "sign-in" ? api.verify : api.linkVerify)({ challengeId, signature: encodeBase58(sig64), provider: toProviderId(entry.name) }, { signal: sig })`. A `provider` of `undefined` is omitted from the JSON body. If aborted, stop. On `!ok`, dispatch `api-error` (same `retryAt` rule) and stop. On `ok`, dispatch `verified { address, network }`.
13. `finally`: unsubscribe from `change` (idempotent) and remove the abort listener.

#### 3.1.6 `use-connect-flow.ts`

```ts
export interface StartOptions { readonly preferredAddress?: string }
export interface ConnectFlow {
  readonly state: FlowState;
  /** Aborts any running attempt, then starts attemptId = previous + 1. */
  start(entry: WalletEntry, network: SolanaNetwork, options?: StartOptions): void;
  /** Resolves the pending selectAccount promise and dispatches account-selected via the driver. */
  chooseAccount(address: string): void;
  /** Aborts the running attempt and dispatches reset. Called when the modal closes. */
  cancel(): void;
}
export function useConnectFlow(options: { readonly mode: FlowMode; readonly api?: FlowApi }): ConnectFlow;
```

- `useReducer(reduce, initialFlowState)`.
- Refs: `attemptCounter`, the current `AbortController`, and the pending account resolver `{ resolve, reject } | null`.
- `expectedDomain` is `window.location.host`, read inside `start`, never during render.
- `api` defaults to the module's `apiClient`.
- On unmount the running attempt is aborted.
- The last `entry`, `network` and chosen address are kept in a ref, so the modal's retry buttons call `start(lastEntry, lastNetwork, { preferredAddress })`. "Start again" after `account-changed` passes no preferred address.

#### 3.1.7 `errors.ts` — `classifyWalletError`

```ts
export type WalletErrorKind = "rejected" | "disconnected" | "other";
export function classifyWalletError(error: unknown): WalletErrorKind;
```

Rules, applied to each node of the error chain. The chain is the value itself, then `.cause`, then `.error`, which is how wallet-adapter-style `WalletSignMessageError` wrappers nest the inner error. The walk is breadth-first, stops at depth 5, and keeps a `Set` of visited nodes so a cycle cannot loop. The first node that matches decides:

1. `node.code === 4001` or `node.code === "4001"` → `rejected`. This is the EIP-1193-style "user rejected" code that Phantom uses.
2. For text, take `node` itself when it is a string, otherwise `${node.name ?? ""} ${node.message ?? ""}` when either is a string. Text matching `/reject|denied|cancel/i` → `rejected`. This covers Solflare's "User rejected the request", `UserRejectedRequestError`, "Approval Denied" and "Transaction cancelled".
3. Text matching `/disconnect|not connected/i` → `disconnected`. This covers `WalletDisconnectedError`, `WalletNotConnectedError` and "Wallet disconnected".
4. No node matched → `other`. This includes `null`, `undefined`, numbers, `TypeError` and an empty object.

Within a node, the rejection checks come first, so "User rejected; wallet disconnected" is `rejected`. `AbortError` is never passed in, because the driver checks `sig.aborted` first.

#### 3.1.8 `challenge-preview.ts`, `provider-id.ts`, `base58.ts`

```ts
/**
 * Reads the 02a sign-in message (ADR-0006 layout, "\n" line endings): line 0 must be
 * `${expected.domain} wants you to sign in with your Solana account:`, line 1 must equal
 * expected.address, and a line `Chain ID: solana:${expected.network}` must be present.
 * Returns the preview or null on any mismatch. Defense in depth: never show or sign a message
 * that names another domain, account or network.
 */
export function parseChallengePreview(
  message: string,
  expected: { readonly domain: string; readonly address: string; readonly network: SolanaNetwork },
): SignPreview | null;

/** Lowercase, runs of characters outside [a-z0-9_-] → "-", trim "-", cut to 32; "" → undefined.
 *  Matches the server PROVIDER_PATTERN /^[a-z0-9_-]{1,32}$/. "Phantom" → "phantom". */
export function toProviderId(walletName: string): string | undefined;

/** bs58.encode. The only bs58 import in client code (lint R6). */
export function encodeBase58(bytes: Uint8Array): string;
```

#### 3.1.9 `schemas.ts` — response schemas (from the 02a handlers)

All schemas use `import * as z from "zod/mini"`. `z.object` strips unknown keys, which is intended for forward compatibility. Shapes come from the route handlers and `auth/internal/types.ts`/`wallet/internal/repository.ts`:

```ts
const objectId = z.string().check(z.regex(/^[0-9a-f]{24}$/));
const isoDate = z.string().check(z.minLength(1));            // ISO-8601 from toISOString()
const network = z.enum(["devnet", "mainnet-beta"]);          // type-checked against SolanaNetwork below

export const errorBodySchema = z.object({ code: z.string(), message: z.string() });

/** POST /auth/challenge and POST /wallets/link/challenge → 200 */
export const challengeSchema = z.object({ challengeId: objectId, message: z.string(), expiresAt: isoDate });
/** POST /auth/verify → 200 { user, wallet } (+ Set-Cookie) */
export const signInSchema = z.object({
  user: z.object({ id: objectId }),
  wallet: z.object({ id: objectId, address: z.string(), network }),
});
/** WalletView */
export const walletItemSchema = z.object({
  id: objectId, address: z.string(), network,
  provider: z.nullable(z.string()),
  status: z.enum(["active", "disconnected"]),
  linkedAt: isoDate,
});
/** POST /wallets/link/verify → 201 (created) or 200 (already linked) { wallet } */
export const linkSchema = z.object({ wallet: walletItemSchema });
/** GET /me → 200 */
export const meSchema = z.object({
  user: z.object({ id: objectId, createdAt: isoDate }),
  session: z.object({ id: objectId, network, expiresAt: isoDate }),
  wallets: z.array(walletItemSchema),
});
/** GET /wallets → 200 */
export const walletsSchema = z.object({ wallets: z.array(walletItemSchema) });
/** SessionView; GET /sessions → 200 */
export const sessionItemSchema = z.object({
  id: objectId, current: z.boolean(), createdAt: isoDate, lastSeenAt: isoDate, expiresAt: isoDate,
  network, userAgent: z.nullable(z.string()),
});
export const sessionsSchema = z.object({ sessions: z.array(sessionItemSchema) });

export type ChallengeData = z.infer<typeof challengeSchema>;
export type SignInData = z.infer<typeof signInSchema>;
export type WalletItem = z.infer<typeof walletItemSchema>;
export interface LinkData { readonly wallet: WalletItem; readonly created: boolean } // created = status 201
export type MeData = z.infer<typeof meSchema>;
export type SessionItem = z.infer<typeof sessionItemSchema>;
```

`z.enum(["devnet","mainnet-beta"])` duplicates `SOLANA_NETWORK_IDS` so the client never imports `validation`'s runtime (and full `zod`). Two guards keep it in sync. At compile time, `type _Check = AssertEqual<z.infer<typeof network>, SolanaNetwork>` with a local `AssertEqual` type. At runtime, `tests/unit/wallet-connect/api-client.test.ts` asserts `network.options` deep-equals `SOLANA_NETWORK_IDS`; tests may import `@/modules/validation`.

The 204 endpoints (logout, unlink, revoke) return `ApiResult<null>`. Only status 204 counts as success. Any other 2xx is `UNEXPECTED_RESPONSE`.

#### 3.1.10 `api-client.ts`

```ts
export interface ApiFailure {
  readonly ok: false;
  /** Server code (UNAUTHENTICATED, AUTH_FAILED, VALIDATION_FAILED, NETWORK_UNSUPPORTED, NOT_FOUND,
   *  LAST_WALLET, WALLET_ALREADY_LINKED, ORIGIN_REJECTED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE,
   *  INTERNAL, …) or a client code: NETWORK, UNEXPECTED_RESPONSE, ABORTED. */
  readonly code: string;
  readonly message: string;     // server safeMessage or a fixed client string; never shown to users
  readonly retryAfter?: number; // seconds; 429 only
}
export type ApiResult<T> = { readonly ok: true; readonly data: T } | ApiFailure;
export interface RequestOptions { readonly signal?: AbortSignal }

export function challenge(input: { address: string; network: SolanaNetwork }, options?: RequestOptions): Promise<ApiResult<ChallengeData>>;
export function verify(input: { challengeId: string; signature: string; provider?: string }, options?: RequestOptions): Promise<ApiResult<SignInData>>;
export function logout(options?: RequestOptions): Promise<ApiResult<null>>;
export function me(options?: RequestOptions): Promise<ApiResult<MeData>>;
export function listWallets(options?: RequestOptions): Promise<ApiResult<readonly WalletItem[]>>;
export function linkChallenge(input: { address: string; network: SolanaNetwork }, options?: RequestOptions): Promise<ApiResult<ChallengeData>>;
export function linkVerify(input: { challengeId: string; signature: string; provider?: string }, options?: RequestOptions): Promise<ApiResult<LinkData>>;
export function unlinkWallet(walletId: string, options?: RequestOptions): Promise<ApiResult<null>>;
export function listSessions(options?: RequestOptions): Promise<ApiResult<readonly SessionItem[]>>;
export function revokeSession(sessionId: string, options?: RequestOptions): Promise<ApiResult<null>>;

export interface ApiClient { /* the ten functions above, same signatures */ }
export const apiClient: ApiClient;

/** One global slot. Returns an unregister that clears the slot only if it still holds `handler`. */
export function onUnauthenticated(handler: () => void): () => void;
```

| Function | Request |
|---|---|
| `challenge` | `POST /api/v1/auth/challenge` `{ address, network }` |
| `verify` | `POST /api/v1/auth/verify` `{ challengeId, signature, provider? }` |
| `logout` | `POST /api/v1/auth/logout` (no body) |
| `me` | `GET /api/v1/me` |
| `listWallets` | `GET /api/v1/wallets` → `data = body.wallets` |
| `linkChallenge` | `POST /api/v1/wallets/link/challenge` `{ address, network }` |
| `linkVerify` | `POST /api/v1/wallets/link/verify` `{ challengeId, signature, provider? }` → `{ wallet, created: status === 201 }` |
| `unlinkWallet` | `DELETE /api/v1/wallets/${encodeURIComponent(id)}` |
| `listSessions` | `GET /api/v1/sessions` → `data = body.sessions` |
| `revokeSession` | `DELETE /api/v1/sessions/${encodeURIComponent(id)}` |

A shared internal `request(method, path, { body?, schema?, expect: 200 | 204 | "200|201", signal })` does the following:
- Every call sends `credentials: "same-origin"` and `cache: "no-store"`, plus `Content-Type: application/json` when there is a body. The browser adds `Origin` on POST/DELETE, which the server's origin check requires ([verified] in the E2E spike).
- `unlinkWallet`/`revokeSession` with an id that is not 24 hex characters return `{ ok:false, code:"VALIDATION_FAILED" }` without calling `fetch`.
- A `fetch` rejection gives `ABORTED` when `signal?.aborted`, otherwise `NETWORK`. **[clarification]** `ABORTED` is new. It is never shown, because the driver ignores aborted attempts.
- A non-2xx status: if the body parses as `errorBodySchema`, use `{ code, message }`; if it doesn't, `UNEXPECTED_RESPONSE`. For 429, `retryAfter = clamp(parseInt(Retry-After), 1, 3600)`, falling back to `60` when the header is missing or invalid **[decision]**.
- A 2xx with an unexpected status, a body that isn't JSON, or a schema mismatch gives `UNEXPECTED_RESPONSE`.
- If the result has code `UNAUTHENTICATED`, the registered handler (if any) is called once, synchronously, before the function resolves.
- It never throws. A `try/catch` covers everything, including `response.json()`.

### 3.2 `src/ui` (primitives)

`"use client"` is on `dialog`, `confirm-dialog`, `toast`, `address`, `menu`, `segmented-control` and `wallet-status`. Those with no hooks or handlers (`button`, `card`, `badge`, `spinner`, `network-indicator`, `ghost-logo`, `skip-link`, `date-time`) are server-safe. Every icon comes from `lucide-react` with `aria-hidden="true"` and sits next to a visible text label.

```ts
// cn.ts
export function cn(...parts: readonly (string | false | null | undefined)[]): string;

// button.tsx
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  readonly variant?: ButtonVariant;      // default "primary"
  /** aria-busy="true" + aria-disabled="true"; clicks ignored; the label stays rendered (invisible) so width is kept; Spinner overlays. */
  readonly loading?: boolean;
  /** Screen-reader text while loading; default "Working…". */
  readonly loadingLabel?: string;
}
export function Button(props: ButtonProps): JSX.Element;   // type="button" default; min-h-11 (44px)

// card.tsx
export interface CardProps { readonly title?: string; readonly headingLevel?: 2 | 3; readonly as?: "section" | "div" | "article"; readonly children: ReactNode; readonly className?: string }
export function Card(props: CardProps): JSX.Element;       // section gets aria-labelledby the heading when title is set

// badge.tsx
export type BadgeTone = "neutral" | "violet" | "success" | "warning" | "error";
export function Badge(props: { readonly tone?: BadgeTone; readonly children: ReactNode }): JSX.Element;

// spinner.tsx
/** Animated ring (aria-hidden) + visible `label`. Under prefers-reduced-motion the ring is replaced
 *  by a static dot (motion-reduce:hidden / hidden motion-reduce:inline-block); the label is always visible. */
export function Spinner(props: { readonly label: string }): JSX.Element;

// dialog.tsx
export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;           // Escape, the Close button, native cancel/close
  readonly title: string;                 // rendered as <h2 id={useId()}>, wired via aria-labelledby
  readonly description?: string;          // <p id> wired via aria-describedby
  readonly children: ReactNode;
  readonly closeLabel?: string;           // default "Close"
}
export function Dialog(props: DialogProps): JSX.Element;

// confirm-dialog.tsx
export interface ConfirmDialogProps {
  readonly open: boolean; readonly title: string; readonly body: string;
  readonly confirmLabel: string; readonly cancelLabel?: string;  // default "Cancel"
  readonly tone?: "danger" | "primary";                           // default "danger"
  readonly pending?: boolean;                                     // confirm Button loading
  readonly error?: string | null;                                 // role="alert" paragraph inside the dialog
  readonly onConfirm: () => void; readonly onCancel: () => void;
}
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;  // initial focus: Cancel

// toast.tsx
export type ToastTone = "info" | "success" | "error";
export interface ToastInput { readonly message: string; readonly tone?: ToastTone }  // default "info"
export function ToastProvider(props: { readonly children: ReactNode }): JSX.Element;
export function useToast(): { show(input: ToastInput): void; dismiss(id: number): void };
/** Rendered by ToastProvider: an always-present <div role="status" aria-live="polite"> for info/success and
 *  an always-present <div role="alert"> for errors (live regions exist before content is inserted).
 *  Each toast has a "Dismiss" button and auto-dismisses after 6000 ms. */

// address.tsx
/** "AbCd…WxYz" (4 + "…" + 4); values of 10 characters or fewer are returned unchanged. */
export function truncateAddress(value: string): string;
export interface AddressProps { readonly value: string; readonly copyable?: boolean; readonly className?: string }
/** <span class="font-mono" title={value}><span aria-hidden>{truncated}</span><span class="sr-only">{value}</span></span>;
 *  copyable adds a "Copy address" button → navigator.clipboard.writeText; its own role="status" region
 *  announces "Address copied" (or "Couldn't copy the address") and clears after 2000 ms. */
export function Address(props: AddressProps): JSX.Element;

// date-time.tsx
/** <time dateTime={iso}>{format}</time>, format = Intl.DateTimeFormat("en-US",
 *  { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC". Deterministic on server and
 *  client, so no hydration mismatch. */
export function DateTime(props: { readonly iso: string }): JSX.Element;

// network-indicator.tsx
export function networkLabel(network: SolanaNetwork): "Devnet" | "Mainnet-beta";
/** <span> dot (aria-hidden, success for devnet / warning for mainnet-beta) + visible label text. */
export function NetworkIndicator(props: { readonly network: SolanaNetwork }): JSX.Element;

// menu.tsx — WAI-ARIA menu button
export interface MenuItem { readonly id: string; readonly label: string; readonly onSelect: () => void; readonly tone?: "danger" }
export interface MenuButtonProps { readonly label: ReactNode; readonly accessibleLabel: string; readonly items: readonly MenuItem[] }
/** button[aria-haspopup="menu"][aria-expanded][aria-controls]; ul[role="menu"] > li[role="menuitem"][tabindex=-1].
 *  Enter/Space/ArrowDown open and focus the first item; ArrowUp opens and focuses the last; ArrowUp/Down/Home/End move
 *  (roving focus); Enter/Space select; Escape closes and returns focus to the button; Tab and outside pointerdown close. */
export function MenuButton(props: MenuButtonProps): JSX.Element;

// segmented-control.tsx
export interface SegmentedControlProps<T extends string> {
  readonly legend: string; readonly name: string; readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void; readonly disabled?: boolean;
}
/** <fieldset><legend> + native <input type="radio"> per option, visually styled as segments
 *  (the checked segment is violet with a Check icon; never colour alone). */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element;

// wallet-status.tsx
export interface WalletStatusProps {
  readonly address: string; readonly network: SolanaNetwork;
  readonly onCopyAddress: () => void; readonly onSwitchNetwork: () => void; readonly onSignOut: () => void;
}
/** MenuButton whose label is <Address value={address}/> (truncated); accessibleLabel "Wallet menu";
 *  items: "Copy address", "Switch to {other network label}", "Sign out" (danger). */
export function WalletStatus(props: WalletStatusProps): JSX.Element;

// ghost-logo.tsx
export function GhostLogo(props: { readonly className?: string }): JSX.Element; // text wordmark "GHOST WIRE"

// skip-link.tsx
export function SkipLink(props: { readonly href?: string }): JSX.Element;       // default "#main"; "Skip to content"
```

**Dialog behaviour [decision].** happy-dom's `showModal()` only sets `open`. It does not move focus, close on Escape, fire `cancel`, make the outside inert, or match `:modal` ([verified] §9.5). So the component owns those behaviours and works the same in happy-dom and Chromium. No test shim is needed.

1. `useEffect([open])`: when opening, store `document.activeElement` as the return target, call `showModal()`, then focus `[data-autofocus]` inside, else the first focusable. When closing, call `close()` and focus the stored return target.
2. `onKeyDown`: Escape calls `preventDefault()` and `onClose()`. Tab and Shift+Tab wrap between the first and last focusable elements (the focus trap).
3. `onCancel`: `preventDefault()` and `onClose()`. This is the browser path.
4. `onClose` (the native `close` event): if the `open` prop is still `true`, call `onClose()`. This keeps state in sync when the browser closes the dialog on its own, for example through Chrome's close-watcher rules.
5. The title is an `<h2>` with an `id` from `useId()`, referenced by `aria-labelledby`. A Close button is always rendered. A closed `<dialog>` is not in the accessibility tree, so `queryByRole("dialog")` is `null` ([verified]).

### 3.3 `src/components` (feature components)

```ts
// use-fresh-navigation.ts  ("use client")
export type AppPath = "/" | "/dashboard" | "/settings/wallets" | "/settings/sessions";
/** router.replace(path) then router.refresh(): replace fetches the new page (dynamic stale time is 0),
 *  and refresh re-renders shared layouts such as the (app) shell's network indicator. */
export function useFreshNavigation(): (path: AppPath) => void;

// use-countdown.ts  ("use client")
/** Whole seconds until `until` (epoch ms), never below 0; ticks with setInterval(1000); null → 0. */
export function useCountdown(until: number | null): number;

// connect-wallet-copy.ts (pure)
export type FlowAction = "retry" | "reconnect" | "start-again" | "close";
export interface FlowCopy { readonly message: string; readonly tone: "info" | "success" | "error"; readonly action: FlowAction | null }
export function flowCopy(state: FlowState, context: { readonly mode: FlowMode; readonly walletName: string; readonly secondsLeft: number }): FlowCopy | null; // null for idle/choosing-account
export const MAINNET_NOTE = "Private payments aren't available on mainnet yet. Signing in only links your wallet.";
export const NO_WALLET_SIGN_IN = "This wallet can't sign in to GHOST WIRE.";

// panel-copy.ts (pure)
export const UNREACHABLE = "We can't reach GHOST WIRE right now. Check your connection and try again.";
export const GENERIC = "Something went wrong. Try again.";
export function panelErrorCopy(failure: ApiFailure): string; // LAST_WALLET → "You can't unlink your only wallet."; DEPENDENCY_UNAVAILABLE|NETWORK → UNREACHABLE; else GENERIC

// connect-button.tsx ("use client")
export interface ConnectButtonProps {
  readonly children: ReactNode; readonly variant?: ButtonVariant;
  readonly mode?: FlowMode;                    // default "sign-in"
  readonly initialNetwork?: SolanaNetwork;     // default "devnet"
}
/** The modal is loaded with next/dynamic(() => import("./connect-wallet-modal"), { ssr: false }) on first open,
 *  which keeps wallet-connect, zod/mini and bs58 off the landing page's initial JS. */
export function ConnectButton(props: ConnectButtonProps): JSX.Element;

// connect-wallet-modal.tsx ("use client")
export interface ConnectWalletModalProps {
  readonly open: boolean; readonly onClose: () => void;
  readonly mode: FlowMode; readonly initialNetwork?: SolanaNetwork;   // default "devnet"
  readonly api?: FlowApi;                                              // tests may inject; default apiClient
}
export function ConnectWalletModal(props: ConnectWalletModalProps): JSX.Element;

// wallet-list.tsx, account-picker.tsx, flow-status.tsx ("use client"; used only by the modal)
export function WalletList(props: { readonly wallets: readonly WalletEntry[]; readonly disabled: boolean; readonly onPick: (entry: WalletEntry) => void }): JSX.Element;
export function AccountPicker(props: { readonly accounts: readonly AccountOption[]; readonly onChoose: (address: string) => void }): JSX.Element;
export function FlowStatus(props: { readonly state: FlowState; readonly mode: FlowMode; readonly walletName: string; readonly onAction: (action: FlowAction) => void }): JSX.Element;

// app-shell/nav-items.ts
export interface NavItem { readonly key: string; readonly label: string; readonly icon: LucideIcon; readonly href: AppPath | null; readonly soon: boolean; readonly mobile: boolean; readonly desktop: boolean }
export const NAV_ITEMS: readonly NavItem[];
// Dashboard(/dashboard, both; mobile label "Home"), Send/Receive/Activity (soon, both), Payments (soon, desktop only), Settings (/settings/wallets, desktop only)

// app-shell/app-shell.tsx (server component)
export interface ShellViewer { readonly address: string; readonly network: SolanaNetwork }
export function AppShell(props: { readonly viewer: ShellViewer; readonly children: ReactNode }): JSX.Element;
// renders <TopBar viewer/>, <Sidebar/> (md:block), <main id="main" tabIndex={-1}>{children}</main>, <BottomNav/> (md:hidden), <SessionExpiredHandler/>

// app-shell/top-bar.tsx ("use client")
export function TopBar(props: { readonly viewer: ShellViewer }): JSX.Element;
// <header>: GhostLogo link to /dashboard, NetworkIndicator, Settings link (/settings/wallets, icon + "Settings"),
// WalletStatus. Copy → clipboard + toast "Address copied"; Switch network → ConnectWalletModal (sign-in, other network);
// Sign out → logout() → success: toast "You're signed out." + navigate("/"); failure (not UNAUTHENTICATED) → error toast panelErrorCopy.

// app-shell/sidebar.tsx, bottom-nav.tsx ("use client")
export function Sidebar(): JSX.Element;    // <nav aria-label="Main">
export function BottomNav(): JSX.Element;  // <nav aria-label="Main mobile"> fixed bottom, safe-area padding
// Active item: <Link aria-current="page"> with the violet treatment. A "soon" item is
// <button type="button" aria-disabled="true" aria-describedby={soonId}> with label text + <Badge>Soon</Badge>; click does nothing.

// wallets-panel.tsx ("use client")
export interface WalletsPanelProps { readonly wallets: readonly WalletItem[]; readonly currentWalletId: string; readonly network: SolanaNetwork }
export function WalletsPanel(props: WalletsPanelProps): JSX.Element;

// sessions-panel.tsx ("use client")
export function SessionsPanel(props: { readonly sessions: readonly SessionItem[] }): JSX.Element;

// session-expired-handler.tsx ("use client")
/** useEffect: onUnauthenticated(() => { toast "Your session ended. Sign in again to continue."; navigate("/") }); returns the unregister. Renders null. */
export function SessionExpiredHandler(): null;

// service-unavailable.tsx ("use client")
/** <main id="main"> + <h1>"We can't reach GHOST WIRE right now."</h1> + "Check your connection and try again." + "Try again" → router.refresh(). */
export function ServiceUnavailable(): JSX.Element;
```

**Disabled "Soon" nav items [decision].** The spec says `aria-disabled="true"` and not links. A `<span aria-disabled>` has no role that supports `aria-disabled` under ARIA 1.2, and axe can flag it. A `<button type="button" aria-disabled="true">` is valid, stays discoverable by keyboard and screen reader, and is announced as dimmed or unavailable.

**Modal composition.** In order:
- the `Dialog` with title "Connect a wallet" (sign-in) or "Link another wallet" (link)
- the `SegmentedControl` (legend "Network", Devnet/Mainnet-beta), disabled while `isInFlight`, with `MAINNET_NOTE` below it as a `<p>` when mainnet-beta is selected
- the `WalletList` while `state.status` is `idle` or a terminal state other than `done`
- the `AccountPicker` while `choosing-account`
- the `FlowStatus` in a `<div role="status" aria-live="polite">`

Failure copy is rendered inside a nested `role="alert"` paragraph.

On `done`:
- **Sign-in:** call `navigate("/dashboard")` and then `onClose()`.
- **Link:** show "Wallet linked." with a focused "Close" button (`data-autofocus`), and call `router.refresh()` so the wallets list updates.

Closing the modal calls `flow.cancel()`.

`WalletList` empty state, shown when `useWallets()` returns `[]`:
- "No Solana wallet found in this browser."
- links "Get Phantom" (`https://phantom.com/download`) and "Get Solflare" (`https://solflare.com/download`), with `target="_blank" rel="noopener noreferrer"` and visually hidden "(opens in a new tab)"
- a "Refresh" button that calls `refreshWallets()`

Each wallet is a `<button>` with `<img src={icon} alt="" width={24} height={24}>` and its name. When `canSignIn` is false, the button is `disabled` with `aria-describedby` pointing at `NO_WALLET_SIGN_IN` text.

### 3.4 Copy table for `flowCopy` (spec §5.2, plus link-mode wording, see §10 D4)

| State | sign-in mode | link mode | Tone | Action |
|---|---|---|---|---|
| connecting | "Connecting to {wallet}…" | same | info | — |
| challenging | "Preparing your sign-in…" | "Preparing your request…" | info | — |
| awaiting-signature | "Approve the sign-in request in your wallet." | "Approve the link request in your wallet." | info | — (preview rendered below: domain, `Address` mono truncated, `networkLabel`) |
| verifying | "Verifying…" | same | info | — |
| done | "Your wallet is connected." | "Wallet linked." | success | sign-in: none (navigates); link: `close` |
| rejected | "You cancelled the sign-in." | "You cancelled the request." | error | `retry` "Try again" |
| disconnected | "Your wallet disconnected." | same | error | `reconnect` "Reconnect" |
| account-changed | "Your wallet switched accounts. Start again with the new account." | same | error | `start-again` "Start again" |
| rate-limited | "Too many attempts. Try again in {n}s." (n = `secondsLeft`); at 0: "You can try again now." | same | error | `retry`, disabled while n > 0 |
| failed AUTH_FAILED | "We couldn't verify that signature. Request a new sign-in." | "We couldn't verify that signature. Try again." | error | `retry` |
| failed WALLET_ALREADY_LINKED | "That wallet is linked to another GHOST WIRE account." | same | error | `retry` |
| failed NETWORK_UNSUPPORTED | "That network isn't available right now." | same | error | `retry` |
| failed UNREACHABLE | "We can't reach GHOST WIRE right now. Check your connection and try again." | same | error | `retry` |
| failed OTHER | "Something went wrong. Try again." | same | error | `retry` |

Every action calls `flow.start(...)` with a new attempt and a new challenge.

### 3.5 Backend interface changes (`@/modules/auth`, `@/modules/security`, `@/modules/shared`)

```ts
// auth/internal/types.ts (additions)
/** What read-only views need: the request time and the resolved session. AuthContext satisfies it. */
export type SessionReader = Pick<AuthContext, "at" | "session">;
/** A session resolved for a server component render (never slid). */
export interface PageSession extends SessionReader {}
/** Structural subset of next/headers' ReadonlyRequestCookies, so auth never imports next/headers. */
export interface CookieReader { get(name: string): { readonly value: string } | undefined }

// auth/internal/cookies.ts (additions)
/** value → the token when it is a 43-char base64url string, else null (same TOKEN_PATTERN as readSessionToken). */
export function parseSessionTokenValue(value: string | undefined): string | null;
/** True when the Cookie header carries a non-empty value under "__Host-gw_session" or "gw_session". */
export function carriesSessionCookie(request: Request): boolean;

// auth/internal/sessions.ts (changed + new)
export function resolveSession(token: string | null, at: Date, options?: { readonly slide?: boolean }): Promise<SessionResolution | null>;
/** Best effort, never rejects: revokes the still-active session behind `token` (any user) with reason "replaced". */
export function replaceSession(token: string | null, at: Date): Promise<void>;

// auth/internal/sign-in.ts (changed)
export function verifySignIn(body: unknown, meta: RequestMeta, options?: { readonly previousToken?: string | null }): Promise<SignInResult>;

// auth/internal/account.ts, session-management.ts (parameter types widened; AuthContext callers unchanged)
export function getMe(auth: SessionReader): Promise<MeView>;
export function listWallets(auth: SessionReader): Promise<WalletView[]>;
export function listSessions(auth: SessionReader): Promise<SessionView[]>;

// auth/internal/page-session.ts (new)
/**
 * For server components: reads the configured cookie name (sessionCookieName(loadConfig().APP_ORIGIN)),
 * parseSessionTokenValue, then resolveSession(token, now(), { slide: false }). Never writes.
 * @throws DependencyUnavailableError when the database is unreachable
 */
export function resolvePageSession(cookies: CookieReader): Promise<PageSession | null>;
```

`auth/index.ts` adds `resolvePageSession`, `replaceSession`, `parseSessionTokenValue`, `carriesSessionCookie` and the types `SessionReader`, `PageSession`, `CookieReader`.

`security`: `SECURITY_REASONS` gains `"replaced"`, appended last.

`shared`: `toErrorResponse` keeps its signature (§5.1).

**[clarification]** The spec writes `resolveSession(token, opts?)`. The real 02a signature has a second `at: Date` parameter, so the options object is the third parameter.

### 3.6 `src/csp.ts` and `src/proxy.ts`

```ts
// src/csp.ts (pure; unit-tested)
/** 16 random bytes (crypto.getRandomValues), base64 via btoa. */
export function createNonce(): string;
export function buildContentSecurityPolicy(nonce: string, options: { readonly dev: boolean }): string;
// → "default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'[ 'unsafe-eval' when dev];
//    style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';
//    object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"   (joined with "; ")

// src/proxy.ts
export function proxy(request: NextRequest): NextResponse;
export const config: { matcher: [...] };   // §6.4
```

**[clarification]** `object-src 'none'` is added to the spec's directive list as hardening. `upgrade-insecure-requests` from the Next docs example is **not** used: it would upgrade subresources on the `http://127.0.0.1` E2E origin and break them.

### 3.7 Test doubles

```ts
// tests/helpers/fake-wallet.ts — runs in unit (node) and ui (happy-dom); signs with real Ed25519
// via tests/helpers/ed25519.ts (node:crypto), so signatures verify like a real wallet's.
export type FakeWalletMode = "approve" | "reject" | "disconnect" | "switch-account" | "hang" | "no-signMessage";
export type RejectionShape = "standard-4001" | "phantom" | "solflare" | "wrapped";
export interface FakeWalletOptions {
  readonly name?: string;                    // default "Fake Wallet"
  readonly mode?: FakeWalletMode;            // default "approve"
  readonly accountCount?: number;            // default 1 (≥ 2 exercises the picker)
  readonly chains?: readonly `${string}:${string}`[]; // default ["solana:devnet", "solana:mainnet"]
  readonly rejectOn?: "connect" | "sign";    // default "sign" (applies to reject/disconnect)
  readonly rejectionShape?: RejectionShape;  // default "standard-4001"
}
export interface FakeWallet {
  readonly wallet: Wallet;                   // version "1.0.0", data:image/svg+xml icon, features per mode
  readonly keys: readonly TestWallet[];      // from tests/helpers/ed25519.ts; keys[i].address = account i
  setMode(mode: FakeWalletMode): void;
  readonly calls: { readonly connect: number; readonly signMessage: number };
  /** Calls every standard:events "change" listener. */
  emitChange(properties: StandardEventsChangeProperties): void;
  /** getWallets().register(wallet); returns unregister (call it in afterEach). */
  register(): () => void;
}
export function createFakeWallet(options?: FakeWalletOptions): FakeWallet;
```

Mode semantics:

| Mode | Behaviour |
|---|---|
| `approve` | `connect` returns the accounts; `signMessage` returns `[{ signedMessage: message, signature: keys[i].signBytes(message), signatureType: "ed25519" }]` |
| `reject` | The step named by `rejectOn` rejects with the chosen shape: `standard-4001` = `Object.assign(new Error("User rejected the request."), { code: 4001 })`; `phantom` = the plain object `{ code: 4001, message: "User rejected the request." }`; `solflare` = `new Error("User rejected the request")` with `name = "WalletSignMessageError"`; `wrapped` = `{ name: "WalletSignMessageError", error: { code: 4001 } }` |
| `disconnect` | Emits `change { accounts: [] }`, then rejects with an `Error` whose name is `"WalletDisconnectedError"` and message is `"Wallet disconnected"` |
| `switch-account` | `signMessage` emits `change { accounts: [<new random account>] }` and returns a promise that never settles |
| `hang` | `signMessage` returns a promise that never settles |
| `no-signMessage` | `features` has `standard:connect` and `standard:events` only |

```ts
// tests/helpers/fake-api.ts — happy-dom and node: stubs globalThis.fetch with vi.stubGlobal
export type ApiRouteKey =
  | "POST /api/v1/auth/challenge" | "POST /api/v1/auth/verify" | "POST /api/v1/auth/logout"
  | "GET /api/v1/me" | "GET /api/v1/wallets" | "POST /api/v1/wallets/link/challenge"
  | "POST /api/v1/wallets/link/verify" | "DELETE /api/v1/wallets/:id" | "GET /api/v1/sessions"
  | "DELETE /api/v1/sessions/:id";
export type FakeHandler = (request: Request, params: { readonly id?: string }) => Response | Promise<Response>;
export interface FakeApi { readonly requests: readonly Request[]; restore(): void }
/** Unknown routes return 500 { code: "INTERNAL" } and are recorded; tests assert on `requests`. */
export function mockApi(handlers: Partial<Record<ApiRouteKey, FakeHandler>>): FakeApi;
export function json(status: number, body: unknown, headers?: Record<string, string>): Response;
export function noContent(): Response;
/** A challenge whose message is the real 02a layout for the given domain/address/network (uses
 *  buildSignInMessage from @/modules/wallet, which tests may import). */
export function challengeFor(input: { address: string; network: SolanaNetwork; domain?: string; purpose?: "signin" | "link" }): { challengeId: string; message: string; expiresAt: string };

// tests/helpers/next-navigation.ts
export const routerMock: { replace: Mock; refresh: Mock; push: Mock; back: Mock; prefetch: Mock };
export function setPathname(pathname: string): void;
/** mockReset() on every routerMock fn and pathname back to "/dashboard". */
export function resetNavigationMock(): void;
export const navigationMock: { useRouter: () => typeof routerMock; usePathname: () => string };
// test files: vi.mock("next/navigation", async () => (await import("../../helpers/next-navigation")).navigationMock);
// tests/setup/ui.setup.ts resets routerMock and the pathname ("/dashboard") in afterEach.
```

```ts
// tests/e2e/support/keys.ts (node)
export interface E2eKey { readonly address: string; readonly publicKey: number[]; readonly pkcs8: number[] }
/** generateKeyPairSync("ed25519"); address = bs58(raw 32-byte key from JWK x); pkcs8 = DER export. */
export function createE2eKey(): E2eKey;

// tests/e2e/support/test-wallet.ts — self-contained: NO imports, NO outer references (page.addInitScript serializes it)
export type TestWalletMode = "approve" | "reject" | "disconnect" | "hang";
export interface TestWalletSpec { readonly name: string; readonly icon: string; readonly accounts: readonly E2eKey[] }
export interface TestWalletInit { readonly wallets: readonly TestWalletSpec[] }
export interface TestWalletControl {
  setMode(mode: TestWalletMode, walletName?: string): void;   // undefined = every wallet
  /** Makes accounts[index] the only connected account and emits standard:events change { accounts: [it] }. */
  switchAccount(walletName: string, index: number): void;
  signCount(walletName?: string): number;
}
/** For each spec: builds a Wallet Standard wallet (chains solana:devnet + solana:mainnet; features standard:connect,
 *  standard:events, solana:signMessage v1.1.0) whose signMessage signs with
 *  crypto.subtle.sign("Ed25519", importKey("pkcs8", …)). Registers through BOTH halves of the protocol:
 *    window.addEventListener("wallet-standard:app-ready", e => e.detail.register(wallet));
 *    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: ({ register }) => register(wallet) }));
 *  and exposes window.__gwTestWallet: TestWalletControl. */
export function installTestWallets(init: TestWalletInit): void;
```

Mode semantics in the page:
- `reject`: `signMessage` rejects with an `Error` carrying `code: 4001`.
- `disconnect`: emits `change { accounts: [] }`, then rejects with `WalletDisconnectedError`.
- `hang`: never settles.

TS 6 rule: pass `new Uint8Array(input.message)` to `crypto.subtle.sign`. A `Uint8Array<ArrayBufferLike>` is not a `BufferSource` under TS 6 + DOM lib, and `next build` type-checks `tests/**` ([verified] §9.6). Tests reach the control through a cast, `(window as unknown as { __gwTestWallet: TestWalletControl })`, with no `declare global`, so app code never sees the type.

```ts
// tests/e2e/support/fixtures.ts
export const test: TestType<{ wallets: WalletKit; guards: void }, object>;  // base.extend(...)
export { expect } from "@playwright/test";
export interface WalletKit {
  /** page.addInitScript(installTestWallets, init); records every address for the privacy guard. */
  install(page: Page, wallets: readonly { name: string; keys: readonly E2eKey[] }[]): Promise<void>;
  key(): E2eKey;                                      // createE2eKey() + remembered for the privacy guard
}
/** axe: new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
 *  expect(violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]). */
export function expectNoSeriousAxeViolations(page: Page): Promise<void>;
```

`guards` is an auto fixture (`{ auto: true }`). It attaches to the default `page` and checks the following after every test:
- `page.on("request")` URLs: every non-`data:`/`blob:` URL's origin equals `E2E_ORIGIN`, and no URL contains any recorded address.
- `page.on("framenavigated")` URLs and `page.title()` contain no address.
- `page.on("console")`: no message matches `/Content Security Policy/i`.
- `page.on("response")` for `resourceType() === "document"`: the `content-security-policy` header exists and contains `'nonce-`.
- At teardown, if the page is open: `JSON.stringify(localStorage)` contains no address.

---

## 4. Data flow per page

### 4.1 Rendering strategy **[decision]**

Every page is dynamically rendered. The root layout calls `await connection()` (from `next/server`), because:
- the nonce CSP requires request-time rendering, so a static page would have no nonce and would not hydrate ([verified] §9.4)
- every page except the 404 reads the session cookie anyway

Dynamic responses get `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` from Next ([verified]), which satisfies the spec's `no-store`. There is no ISR or static generation in this PR.

### 4.2 Shared server loader (`src/app/_server/shell-state.ts`)

```ts
export type ShellState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "signed-in"; readonly viewer: Viewer };
export interface Viewer { readonly me: MeView; readonly currentWallet: WalletView; readonly pageSession: PageSession }

/** React cache(): one evaluation per request, shared by layouts and pages that render in parallel. */
export const loadShellState: () => Promise<ShellState>;
```

```ts
export const loadShellState = cache(async (): Promise<ShellState> => {
  const store = await cookies();                                    // async in Next 16
  try {
    const pageSession = await resolvePageSession(store);            // slide: false, never writes
    if (pageSession === null) return SIGNED_OUT;
    const me = await getMe(pageSession);
    const currentWallet = me.wallets.find((w) => w.id === pageSession.session.walletId.toHexString());
    if (currentWallet === undefined) return SIGNED_OUT;             // data inconsistency: treat as signed out
    return { kind: "signed-in", viewer: { me, currentWallet, pageSession } };
  } catch (error) {
    if (error instanceof UnauthenticatedError) return SIGNED_OUT;   // getMe: user vanished
    if (error instanceof DependencyUnavailableError) {
      logger.warn("page dependency unavailable", { code: error.code });
      return UNAVAILABLE;
    }
    throw error;                                                    // → nearest error.tsx (digest only)
  }
});
```

`redirect()` and `notFound()` are never called inside a `try` block. They work by throwing, and a `catch` would swallow them ([verified] in the Next 16 docs, §9.7).

### 4.3 Per page

| Route | Server reads | Renders | Client calls | After the call |
|---|---|---|---|---|
| `/` (`app/page.tsx`) | `loadShellState()`. `unavailable` is treated as signed out **[decision]**: the landing page must not fail, and the modal reports the outage itself if the user tries | hero copy (spec §5.3); signed out: `ConnectButton` "Open GHOST WIRE" (primary) + `ConnectButton` "Connect wallet" (secondary); signed in: `<Link href="/dashboard">` "Open dashboard" | modal: `challenge` → wallet → `verify` | done: `navigate("/dashboard")` (replace + refresh), close modal |
| `(app)/layout.tsx` | `loadShellState()` | `signed-out` → `redirect("/")` (outside try); `unavailable` → `<ServiceUnavailable/>`; `signed-in` → `<AppShell viewer={{ address: currentWallet.address, network: me.session.network }}>` | top bar: `logout`; Switch network: modal in sign-in mode preset to the other network | sign out: toast "You're signed out." + `navigate("/")`; switch: `navigate("/dashboard")` (the refresh re-renders the shell's network indicator) |
| `(app)/dashboard/page.tsx` | `loadShellState()`; if not signed in, `return null` (the layout redirects) | `<h1>` "Dashboard"; "Your wallet is connected."; `Address` (copyable) + `NetworkIndicator`; "Linked wallets: {n}" (active only); `Card` "Private balances arrive in a later release." | — | — |
| `(app)/settings/layout.tsx` | — | `<h1>` "Settings" + `<nav aria-label="Settings">` links Wallets / Sessions (`aria-current` via a tiny client child using `usePathname`) | — | — |
| `(app)/settings/page.tsx` | — | `redirect("/settings/wallets")` | — | — |
| `(app)/settings/wallets/page.tsx` | `loadShellState()` | `<WalletsPanel wallets={me.wallets} currentWalletId={currentWallet.id} network={me.session.network}/>` | link: modal (link mode) → `linkChallenge`/`linkVerify`; unlink: `unlinkWallet(id)` | link done: `router.refresh()`; unlink other: toast "Wallet unlinked." + `router.refresh()`; unlink current: toast "You unlinked the wallet you signed in with, so you've been signed out." + `navigate("/")`; `LAST_WALLET`: inline alert in the confirm dialog; `NOT_FOUND`: close dialog + `router.refresh()` |
| `(app)/settings/sessions/page.tsx` | `loadShellState()` then `listSessions(viewer.pageSession)` (`DependencyUnavailableError` → `<ServiceUnavailable/>`) | `<SessionsPanel sessions={…}/>` | `revokeSession(id)` | other: toast "Session revoked." + `router.refresh()`; current: toast "This device was signed out." + `navigate("/")` |
| `not-found.tsx` | — | "Page not found." + `<Link href="/">` "Go to the start page" | — | — |
| `error.tsx`, `(app)/error.tsx` | — | "Something went wrong." + "Try again" (`retry()`) + `Reference: {digest}` when present | — | — |

The wallets panel decides "unlinking the current wallet" by comparing with `currentWalletId`, which the server passes. The `DELETE` returns a bare 204 in both cases, and the client cannot read the HttpOnly `Set-Cookie`.

Wallets panel rows show:
- the address (`Address`, copyable)
- the network (`NetworkIndicator`)
- the provider (`provider ?? "Unknown"`)
- the status (`Badge`: active → "Active" with tone success; disconnected → "Unlinked" with tone neutral)
- the linked date (`DateTime`)
- for active wallets, an "Unlink" button that opens `ConfirmDialog`. Its title is "Unlink this wallet?", its body is the spec copy ("Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain."), and its confirm label is "Unlink".

Sessions panel rows show:
- "This device" (`Badge` violet) for `current`
- the network
- the user agent (`truncate`, `title` = the full UA, or "Unknown device" when it is null)
- "Last seen" and "Expires" (`DateTime`)

Each row has a button:
- **Other sessions:** "Revoke". `ConfirmDialog` title "Revoke this session?", body "That device will be signed out of GHOST WIRE.", confirm label "Revoke".
- **Current session:** "Sign out this device". Title "Sign out this device?", body "You'll be signed out and returned to the start page.", confirm label "Sign out".

### 4.4 Privacy in the data flow

- Routes are fixed strings. Ids appear only in `/api/v1` `DELETE` paths sent with `fetch`, never in navigations.
- Every `metadata.title` is a static string: "GHOST WIRE", "Dashboard · GHOST WIRE", "Wallets · GHOST WIRE", "Sessions · GHOST WIRE", "Page not found · GHOST WIRE".
- Nothing is written to `localStorage`, `sessionStorage` or IndexedDB.
- No `<Link prefetch>` to external hosts. External links are the two install links only.

---

## 5. Backend changes (02a follow-ups)

### 5.1 `toErrorResponse` log levels (`src/modules/shared/internal/http.ts`)

Replace the single `logger.error("request failed", { err: error, code })` line with level selection. The response mapping is unchanged.

```ts
export function toErrorResponse(error: unknown): Response {
  if (!isAppError(error)) {
    logger.error("request failed", { err: error, code: "INTERNAL" });
    return noStoreJson(INTERNAL_BODY, { status: 500 });
  }
  const status = error.httpStatus;
  if (status >= 500) logger.error("request failed", { err: error, code: error.code });
  else if (error.code === "UNAUTHENTICATED") logger.debug("request rejected", { code: error.code, status });
  else logger.warn("request rejected", { code: error.code, status });
  // …unchanged: DependencyUnavailableError (503 + Retry-After 5), >= 500 → INTERNAL, 4xx body + Retry-After for 429
}
```

- 5xx (`DependencyUnavailableError` included) and unknown throws: `error` with `err`. The unknown-throw `code` stays `"INTERNAL"`, as today.
- `UNAUTHENTICATED` (401): `debug`, `{ code, status }`.
- Every other 4xx, including `AUTH_FAILED` (also 401), `RATE_LIMITED`, `ORIGIN_REJECTED` and `VALIDATION_FAILED`: `warn`, `{ code, status }` only, with no `err` and no stack.

`tests/unit/shared/http.test.ts` changes:
- The parametrized 4xx cases (around lines 115–145) assert `logger.warn` with `{ code, status }`, and that `logger.error` was not called.
- The `RATE_LIMITED` case (line 172) becomes `warn` with `{ code: "RATE_LIMITED", status: 429 }`.
- A new `UnauthenticatedError` case asserts `logger.debug("request rejected", { code: "UNAUTHENTICATED", status: 401 })`.
- The 5xx and unknown cases are unchanged.

### 5.2 Stale cookie cleared on 401 (`auth/internal/wrappers.ts`, `cookies.ts`)

```ts
// cookies.ts
const BOTH_NAMES: readonly SessionCookieName[] = ["__Host-gw_session", "gw_session"];
export function carriesSessionCookie(request: Request): boolean {
  // split the Cookie header on ";", trim, and return true if any pair has a name in BOTH_NAMES and a non-empty value
}
export function parseSessionTokenValue(value: string | undefined): string | null {
  return value !== undefined && TOKEN_PATTERN.test(value) ? value : null;
}
// readSessionToken is refactored to call parseSessionTokenValue (behaviour unchanged).

// wrappers.ts — inside withSession's try, replacing the throw:
const resolution = await resolveSession(token, meta.at);
if (token === null || resolution === null) {
  const response = toErrorResponse(new UnauthenticatedError());
  if (carriesSessionCookie(request)) response.headers.append("Set-Cookie", clearSessionCookie(APP_ORIGIN));
  return response;
}
```

- A malformed value, an unknown/revoked/expired token, or the other cookie name: 401 plus the clear for the **configured** name (spec: "`clearSessionCookie(...)`").
- No cookie at all: 401 with no `Set-Cookie`.
- `resolveSession` throwing `DependencyUnavailableError`: 503 with no clear, because an outage must not sign people out. It goes through the existing `catch`.
- An `UnauthenticatedError` thrown later by a handler goes through the existing `catch` without a clear. That path does not exist today.
- Existing tests that expect `setCookies` to equal `[]` on 401 all send no cookie or are on 204 paths. They still pass, because the clear is added only when the request carried a cookie.

### 5.3 Old session revoked on re-sign-in

**Where it hooks in.** The route reads the old token, and `verifySignIn` revokes it after the new session has committed:

```ts
// src/app/api/v1/auth/verify/route.ts
export const POST: RouteHandler = withOrigin(async (request) => {
  const meta = requestMeta(request);
  const previousToken = readSessionToken(request, loadConfig().APP_ORIGIN);
  const result = await verifySignIn(await readJsonBody(request), meta, { previousToken });
  const response = noStoreJson(result.body, { status: 200 });
  response.headers.append("Set-Cookie", result.setCookie);
  return response;
});

// sign-in.ts — verifySignIn, inside the try, after writeSignIn(...) resolves and after the
// signin_success recordSecurityEvent, before building the return value:
await replaceSession(options?.previousToken ?? null, meta.at);
```

```ts
// sessions.ts
export async function replaceSession(token: string | null, at: Date): Promise<void> {
  if (token === null) return;
  try {
    const previous = await resolveSession(token, at, { slide: false });
    if (previous === null) return;
    const result = await sessions.updateOne(
      Object.assign({}, safeEquals("_id", previous.session.id), { revokedAt: null }),  // atomic, like logout; any user
      { $set: { revokedAt: at } },
    );
    if (result.modifiedCount === 1) {
      await recordSecurityEvent({
        type: "session_revoked", severity: "info",
        userId: previous.session.userId, walletId: previous.session.walletId,
        reason: "replaced", at,
      });
    }
  } catch (error) {
    logger.warn("previous session revoke failed", { code: isAppError(error) ? error.code : "UNKNOWN" });
  }
}
```

- **Reason enum:** `SECURITY_REASONS` in `security/internal/events.ts` gains `"replaced"` (appended). The Zod event schema uses the enum, so the write validates. `toSecurityReason("replaced")` now returns `"replaced"`.
- **Best effort:** `replaceSession` never rejects. The warn log carries only a code, never `err`, so a driver error cannot leak the token hash from a filter. Sign-in still returns 200 with the new cookie.
- It runs only on success. An `AuthFailedError` throws before it is reached.
- **Link verify** does not call it (spec).
- **Existing tests:** any 02a test that signs in twice with the **same** `TestClient` and then expects the first session to still work would now fail. A scan found none: the multi-session tests use separate clients (`phone`/`laptop`). Running the full integration suite is a required step of the task that lands this.

### 5.4 `resolveSession(token, at, { slide })`

```ts
export async function resolveSession(
  token: string | null, at: Date, options: { readonly slide?: boolean } = {},
): Promise<SessionResolution | null> {
  const slide = options.slide ?? true;
  // …unchanged lookup and checks…
  if (slide && atMs - doc.lastSeenAt.getTime() >= SLIDE_INTERVAL_MS) { /* unchanged CAS update */ }
  // …unchanged return; slid stays false when slide is false
}
```

With `slide: false` the function performs only `findOne` calls. Server components use it through `resolvePageSession`, and `replaceSession` uses it to look up the old session.

---

## 6. Config files

### 6.1 `postcss.config.mjs` (required, [verified] §9.2)

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

Without it, Next does not run Tailwind v4. With it, `next build` (Turbopack) emits the `@theme` variables and utilities: `--color-violet:#a78bfa`, `.bg-obsidian{background-color:var(--color-obsidian)}`, `.rounded-card{border-radius:var(--radius-card)}`.

`src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-obsidian: #09090E;
  --color-surface: #111118;
  --color-elevated: #17151F;
  --color-border: #292936;
  --color-text: #FFFFFF;
  --color-muted: #A1A1AA;
  --color-silver: #C4C4CE;
  --color-violet: #A78BFA;
  --color-violet-hover: #8B5CF6;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #FB7185;
  --radius-card: 16px;
  --radius-control: 10px;
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-heading: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --default-transition-duration: 200ms;
}

@layer base {
  html { color-scheme: dark; }
  body { background-color: var(--color-obsidian); color: var(--color-text); }
  :focus-visible { outline: 2px solid var(--color-violet); outline-offset: 2px; }
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
```

- Spacing uses Tailwind's default `--spacing: 0.25rem`, the 4px scale.
- Motion: transitions use 150–250 ms (`duration-150`/`duration-200`/`duration-250`) and only animate `opacity`/`transform`.
- No light theme.

**Contrast rules [decision].** These were computed with the WCAG formula:

| Pair | Ratio | Use |
|---|---|---|
| text on obsidian | 19.87 | body text |
| muted on obsidian / surface / elevated | 7.75 / 7.33 / 7.04 | secondary text |
| violet on obsidian | 7.30 | links, focus ring, selected nav |
| obsidian text on violet | 7.30 | primary button |
| obsidian text on violet-hover | 4.69 | primary button hover |
| obsidian text on error | 7.38 | danger button |
| **white text on violet** | **2.72** | **never use** |
| border on obsidian | 1.39 | decorative dividers only |

Boundaries of interactive controls (secondary buttons, segments, the menu button) use `--color-muted`, which reaches the 3:1 non-text minimum.

### 6.2 `vitest.config.ts`

Add a third project. The JSX transform needs no plugin: Vite 8's built-in transform compiles `.tsx` with the automatic runtime from `tsconfig` `"jsx": "react-jsx"` ([verified] §9.5).

```ts
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
```

`tests/setup/ui.setup.ts`:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetNavigationMock } from "../helpers/next-navigation";
afterEach(() => { cleanup(); resetNavigationMock(); });   // RTL auto-cleanup needs globals, which are off
```

Coverage `exclude` gains `"src/app/**/*.tsx"`, `"src/proxy.ts"` and `"src/app/fonts.ts"`. Those are covered by E2E, not Vitest.

### 6.3 `playwright.config.ts` **[decision: globalSetup owns everything]**

Playwright runs plugin setup (the `webServer` launcher) **before** `globalSetup`. `createGlobalSetupTasks` = remove output dirs → plugin setup → global setup ([verified] §9.6). A `webServer` could therefore not receive the MongoMemoryReplSet URI. Global setup starts Mongo, builds, starts `next start`, waits for readiness, and returns the teardown.

```ts
import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./tests/e2e/support/origin";

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

```ts
// tests/e2e/support/origin.ts
export const E2E_PORT = process.env.GW_E2E_PORT ?? "3210";
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
```

`tests/e2e/support/global-setup.ts`:

1. Probe `E2E_ORIGIN/api/health` with a 500 ms timeout. If anything answers, throw "port in use", so the run never tests a stale server.
2. `MongoMemoryReplSet.create({ binary: { version: "7.0.12" }, replSet: { count: 1, storageEngine: "wiredTiger" } })`. `MONGOMS_SYSTEM_BINARY` is honoured from the environment. If `/:27017(\/|,|\?|$)/.test(uri)`, throw. The unrelated dev `mongod` on 27017 is never used.
3. Unless `GW_E2E_SKIP_BUILD === "1"`: `execFileSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], { stdio: "inherit" })`, using `createRequire(import.meta.url)`. Node is the runtime (ADR-0002).
4. `spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", E2E_PORT], { detached: true, stdio: ["ignore", logFd, logFd], env })`, where `logFd` opens `test-results/e2e-server.log` (created after Playwright clears `test-results`). The env is built from scratch on top of `process.env`, so values in a developer `.env` cannot leak in, because process env wins over `.env` in Next:
   - `NODE_ENV=production`, `MONGODB_URI=<replset uri>`, `MONGODB_DB_NAME=gw_e2e`, `LOG_LEVEL=warn`
   - `APP_ORIGIN=E2E_ORIGIN` (http, so the cookie is `gw_session`)
   - `SOLANA_NETWORKS=devnet,mainnet-beta`, `TRUST_PROXY=false`, `SESSION_IDLE_DAYS=7`, `SESSION_MAX_DAYS=30`
   - `RATE_LIMIT_CHALLENGE_PER_MIN=1000`, `RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS=1000`, `RATE_LIMIT_VERIFY_PER_MIN=1000`
5. Poll `GET /api/ready` every 250 ms for up to 60 s. It succeeds on 200. On timeout, kill the server and throw with the log path.
6. Return the teardown: `process.kill(-server.pid, "SIGTERM")`, wait up to 10 s for exit (then `SIGKILL`), then `replSet.stop({ doCleanup: true })`.

### 6.4 CSP and security headers

**Outcome ([verified] §9.4):** `script-src 'self'` alone **breaks hydration** in Next 16.4.5. Production HTML contains inline `<script>self.__next_f.push(...)</script>` flight-data scripts. Chromium blocked them with "Executing inline script violates … 'script-src 'self''", and a client counter did not respond to clicks. So, as the spec allows, the CSP uses a per-request nonce set in **`src/proxy.ts`**. Next 16 renamed `middleware.ts` to `proxy.ts` (file `proxy.ts`, export `proxy`, Node.js runtime by default; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`: "deprecated in Next.js 16 and renamed to proxy.js").

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "./csp";

export function proxy(request: NextRequest): NextResponse {
  const csp = buildContentSecurityPolicy(createNonce(), { dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);         // Next reads the nonce from this request header
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

Next applies the nonce automatically to its framework scripts, page chunks and inline flight scripts. `'strict-dynamic'` lets those trusted scripts load further chunks (`next/dynamic`, route chunks). No component reads the nonce. Spike results: `/`, `/dyn` and a 404 page all hydrated, with zero CSP console errors, once the root layout called `connection()`.

**`next.config.ts`:** static headers for every route, plus a locked-down CSP for API responses only. Pages get their CSP only from the proxy; two CSP headers would be intersected by the browser.

```ts
import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
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

The spike confirmed that `/:path*` also matches `/`, and that `/api/health` carries the API CSP and `no-store`.

**`src/app/layout.tsx`:**

```tsx
import "./globals.css";
import { connection } from "next/server";
import { geistMono, inter, spaceGrotesk } from "./fonts";
// metadata unchanged in content (title "GHOST WIRE", static description)
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();    // every page dynamic → nonce applied everywhere (incl. not-found)
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

### 6.5 `package.json`

- **dependencies** gain the 8 runtime pins from §0: the three `@wallet-standard/*` packages, `@solana/wallet-standard-features`, `lucide-react`, the two `@fontsource-variable/*` packages and `geist`.
- **devDependencies** gain the 7 dev pins.
- **Scripts:**

```json
"test:ui": "vitest run --project ui",
"test:e2e": "playwright test"
```

`bun run test` (all Vitest projects) now runs unit, integration and ui. It does not run E2E, so the core gates stay offline-capable.

### 6.6 `tsconfig.json`, `src/app/fonts.ts`, `.gitignore`, `.prettierignore`

- **`tsconfig.json`:** `include` gains `"tests/**/*.tsx"`. Nothing else changes. `next build` left the file untouched in the spike. Be aware that `next build` type-checks everything in `include`, tests and E2E files included (§9.6).
- **`.gitignore`:** add `playwright-report/` and `test-results/` under "dependencies and build output".
- **`.prettierignore`:** add the same two paths.

`src/app/fonts.ts` ([verified] §9.3: `next build` accepted these paths and emitted hashed `.woff2` files under `.next/static/media` plus `… Fallback` faces):

```ts
import localFont from "next/font/local";

export const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter", weight: "100 900", display: "swap",
});
export const spaceGrotesk = localFont({
  src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-space-grotesk", weight: "300 700", display: "swap",
});
export const geistMono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono", weight: "100 900", display: "swap",
});
```

Only the Latin subsets are loaded. Glyphs outside Latin, for example in a wallet's display name, fall back to the system stack. Paths are relative to `src/app/fonts.ts`, so the file must stay at that location.

### 6.7 Docs

- **`docs/adr/0007-frontend-stack-wallet-connection.md`:**
  - **Decision:** B2 (Wallet Standard direct; no web3.js/kit/adapter), B3 (Tailwind v4 `@theme`, own primitives on native `<dialog>`, Lucide, self-hosted fonts), B4 (three test layers), and the CSP mechanism (nonce proxy + all pages dynamic).
  - **Context, Rationale and Alternatives:** from spec §2.
  - **Consequences:**
    - no static pages
    - Playwright on Ubuntu 20.04 needs the platform override (§10 D1)
    - `classifyWalletError` heuristics are confirmed by the manual checklist
- **`docs/testing/wallet-compat.md`:**
  - **Setup:** devnet, a fresh browser profile, the wallet's devnet mode.
  - **Checklist per run:** connect, sign-in, sign rejection, wallet disconnect, account switch, link, unlink, each with an expected result.
  - **Results table:** `| Date | Wallet | Wallet version | Platform (desktop extension / mobile in-app) | Browser + version | Connect | Sign-in | Reject | Disconnect | Account switch | Link | Unlink | Notes |`. One row each for Phantom and Solflare on desktop and on mobile, left empty and filled in only from real runs.
  - **Error shapes:** a section recording the exact rejection and disconnect error shapes seen, to confirm or adjust `classifyWalletError`.
- **`README.md`:**
  - Scripts table: `test:ui` and `test:e2e`, and the `bun run test` row now reads "unit + integration + ui".
  - "UI development": tokens in `globals.css`, primitives in `src/ui`, the layering rules, no third-party requests, the CSP nonce.
  - "End-to-end tests": `bunx playwright install chromium` (on Ubuntu 20.04: `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 bunx playwright install chromium`), `MONGOMS_SYSTEM_BINARY`, `GW_E2E_PORT`, `GW_E2E_SKIP_BUILD=1`, and where the reports are written.

---

## 7. Failure strategy

### 7.1 Abort and stale attempts

- One attempt at a time. `start` aborts the previous controller before incrementing `attemptId`. Closing the modal calls `cancel()`, which aborts and resets. Unmount aborts.
- Three layers stop late results:
  1. `raceAbort` ends a pending wallet promise.
  2. The `signal` passed to `fetch` cancels the HTTP request.
  3. The reducer drops events with an old `attemptId`.

  So a wallet that answers after the modal closed, or a slow `verify` from attempt 1 that lands during attempt 2, changes nothing.
- **Known edge:** an abort after `verify` was sent but before its response. The server may already have created the session and set the cookie (the browser applies `Set-Cookie` even if the JS ignores the response). The UI shows nothing, and the next page load shows the user signed in. That is acceptable and honest: no false error is shown.

### 7.2 429 countdown

- `api-error RATE_LIMITED` produces `rate-limited { retryAt = now + retryAfter*1000 }`. `retryAfter` comes from `Retry-After`, clamped to 1–3600, with 60 as the fallback.
- `useCountdown(retryAt)` re-renders every second. The copy shows `n`. The retry button is `disabled` while `n > 0` and its `aria-describedby` points at the copy. When `n` reaches 0 the copy changes to "You can try again now." in the polite region and the button is enabled.
- The interval is cleared when the state changes or the component unmounts. Retrying starts a new attempt and a new challenge.

### 7.3 `UNAUTHENTICATED`

- **API calls inside `(app)`:** the api-client calls the single registered handler. `SessionExpiredHandler` is mounted only in `AppShell`, so the handler exists only inside `(app)`. It shows the toast "Your session ended. Sign in again to continue." and calls `navigate("/")`. The root layout keeps `ToastProvider` mounted, so the toast survives the navigation.
- The failing panel action or link attempt also gets its `ApiFailure`. The panel shows nothing extra; the link modal shows the OTHER copy briefly before navigation closes it.
- **Server pages:** `withSession` now clears a stale cookie on the API side (§5.2). A server page with a stale cookie sees `resolvePageSession → null` and redirects. It cannot clear the cookie, because server components cannot set cookies. The next API call clears it.
- **`AUTH_FAILED` vs `UNAUTHENTICATED`:** both are 401. Only `UNAUTHENTICATED` triggers the handler. `AUTH_FAILED` is a flow failure with its own copy.

### 7.4 `DependencyUnavailableError` on server pages

- In `(app)`: `loadShellState` returns `unavailable`. The layout renders `<ServiceUnavailable/>` instead of the shell, with no redirect, so the user is not signed out by an outage. "Try again" calls `router.refresh()`.
- The sessions page catches a `listSessions` outage separately and renders the same component inside the shell.
- On the landing page an outage is treated as signed out (§4.3).
- Logged once at `warn` with `{ code }`.

### 7.5 Error boundaries

- `app/error.tsx` and `app/(app)/error.tsx` are client components. Their props are `{ error: unknown; retry: () => void }`.
- **[clarification]** They use `retry()`, not `reset()`. In Next 16.4, `retry()` (stable since 16.3) re-fetches and re-renders the segment. `reset()` only re-renders without re-fetching, which cannot recover from a server-component error.
- They show "Something went wrong." and a "Try again" button. When `error instanceof Error && typeof error.digest === "string"`, they also show "Reference: {digest}". Never the message or stack.
- `(app)/error.tsx` renders inside the shell, so navigation stays available. `app/error.tsx` covers the landing page and anything outside `(app)`.
- Errors thrown in the root layout itself are not covered. `global-error.tsx` is out of the spec's scope, and the root layout does no I/O.

### 7.6 Wallet edge cases

| Situation | Handling |
|---|---|
| No wallets | Empty state with install links and Refresh. Late injection (mobile in-app browsers) arrives through `register` events and re-renders the list |
| Wallet lacks `solana:signMessage` | Listed, disabled, with `NO_WALLET_SIGN_IN` |
| `connect` rejected by the user | `rejected` copy ("You cancelled the sign-in.") |
| Several accounts | Picker. A retry keeps the chosen account through `preferredAddress` |
| Account switch mid-flow | `change` with the selected account missing → `account-changed` and the attempt aborts |
| Disconnect mid-flow | `change` with `accounts: []`, or a disconnect-shaped error → `disconnected` |
| Wallet hangs | The spinner stays, and the user can close the modal (abort). There is no timeout, because a timeout would race a real user who is still reading the prompt |
| Signature not 64 bytes | `failed OTHER` |
| Challenge message names another domain, address or network | `failed OTHER`; nothing is signed |
| Network switch while signed in | The new sign-in replaces the old session on the server (§5.3), then `navigate("/dashboard")` |

---

## 8. Test map (spec §11 → files and cases)

### 8.1 Unit (Vitest `unit`, node)

| Spec item | File | Cases |
|---|---|---|
| every `flow.ts` transition, stale events ignored | `tests/unit/wallet-connect/flow.test.ts` | One `it.each` row per transition-table row. Every status × every event outside the table returns the **same object** (generated matrix). Stale `attemptId` for each event type → same object. `start` with an equal or lower id ignored. `choose-account` with 1 account → `failed OTHER`. `account-selected` with an address outside the list ignored. `wallet-error`/`account-changed` in `verifying` ignored. `toFailureCode` mapping table. `isInFlight` |
| `classifyWalletError` | `tests/unit/wallet-connect/errors.test.ts` | rejected: `{code:4001}`, `{code:"4001"}`, Error+code 4001 (standard), plain object (Phantom), `Error("User rejected the request")` named `WalletSignMessageError` (Solflare), `{name:"WalletSignMessageError", error:{code:4001}}`, `new Error("x",{cause:{code:4001}})`, "Approval Denied", "Transaction cancelled", `UserRejectedRequestError`. disconnected: `WalletDisconnectedError`, `WalletNotConnectedError`, "Wallet not connected", the string "disconnected". other: `TypeError("x")`, `"boom"`, `null`, `undefined`, `42`, `{}`, a self-referential cause cycle (terminates), depth > 5 (stops). Rejection wins over disconnect within one node |
| registry filtering, late register/unregister | `tests/unit/wallet-connect/registry.test.ts` | Uses `createFakeWallet().register()`. Listed with `canSignIn` true; `no-signMessage` listed false; chains without `solana:` and no solana features → not listed; `solana:` feature but no solana chain → listed false; `canSignIn` sorted first; a late register after the first `listSolanaWallets()` notifies the subscriber and the snapshot identity changes; identity is stable without events; unregister removes and notifies; `refreshWallets()` notifies; ids are stable per wallet object; unsubscribe stops notifications |
| api-client mapping | `tests/unit/wallet-connect/api-client.test.ts` | Through `mockApi`. Each function's method, path, body, `credentials: "same-origin"`, `cache: "no-store"`. For each server code (`UNAUTHENTICATED`, `AUTH_FAILED`, `VALIDATION_FAILED`, `NETWORK_UNSUPPORTED`, `NOT_FOUND`, `LAST_WALLET`, `WALLET_ALREADY_LINKED`, `ORIGIN_REJECTED`, `RATE_LIMITED`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL`): `{ok:false, code, message}`. 429 `Retry-After: 42` → 42; missing/`abc` → 60; `0` → 1; `99999` → 3600. A `fetch` rejection → `NETWORK`; aborted → `ABORTED`. A non-JSON body, a schema mismatch, or a 200 on a 204 endpoint → `UNEXPECTED_RESPONSE`. `linkVerify` 201 → `created: true`, 200 → `false`. A bad id → `VALIDATION_FAILED` with no fetch. `onUnauthenticated` called once on `UNAUTHENTICATED`, not on `AUTH_FAILED`; unregister semantics; never throws (`json()` throws → `UNEXPECTED_RESPONSE`). `network` enum options equal `SOLANA_NETWORK_IDS` |
| driver | `tests/unit/wallet-connect/run-flow.test.ts` | `FakeWallet` + a fake `FlowApi`. Event sequence for approve (sign-in and link use the right endpoints); `provider` sent from the name; signature verifies against the challenge with `tests/helpers/ed25519`; `reject` at connect and at sign; `disconnect`; `switch-account` → `account-changed`; `hang` + abort → no further events and the promise resolves; picker via `selectAccount`; `preferredAddress` skips the picker; 429 → `retryAt = now + 42000`; preview mismatch → `UNEXPECTED_RESPONSE`; 63-byte signature → wallet-error other; a `change` after `signed` is ignored; no dispatch after abort |
| preview | `tests/unit/wallet-connect/challenge-preview.test.ts` | A real `buildSignInMessage` output passes. Wrong domain, address or network, a missing Chain ID line, CRLF, and an empty string → `null` |
| provider id | `tests/unit/wallet-connect/provider-id.test.ts` | "Phantom" → "phantom"; "Solflare" → "solflare"; "Backpack Wallet" → "backpack-wallet"; a 40-character name is cut to 32; "!!!" → `undefined`; the output always matches `PROVIDER_PATTERN` |
| base58 | `tests/unit/wallet-connect/base58.test.ts` | Round trip against `bs58.decode` |
| copy | `tests/unit/components/connect-wallet-copy.test.ts`, `panel-copy.test.ts` | Every §3.4 row × mode, exact strings; `secondsLeft` 0 vs > 0; `panelErrorCopy` table |
| CSP | `tests/unit/csp.test.ts` | Exact production string; dev adds `'unsafe-eval'`; production never contains `unsafe-eval` or `upgrade-insecure-requests`; nonce is 24 base64 characters and unique across 100 calls |
| §4 boundaries | `tests/unit/lint/boundaries.test.ts` | §2.4 table |
| §7.1 unit part | `tests/unit/shared/http.test.ts` | §5.1 |
| §7.2 unit part | `tests/unit/auth/cookies.test.ts` | `carriesSessionCookie`: either name with a value → true; an empty value, only other cookies, or no header → false. `parseSessionTokenValue`: valid, malformed, `undefined` |

### 8.2 Component (Vitest `ui`, happy-dom + RTL + user-event)

| Spec item | File | Cases |
|---|---|---|
| Modal: network default + mainnet note | `tests/ui/components/connect-wallet-modal.test.tsx` | Devnet checked by default; choosing Mainnet-beta shows `MAINNET_NOTE`; `initialNetwork="mainnet-beta"` preselected; the radio group is disabled while in flight |
| Modal: empty state | same | No wallets → install links with `rel="noopener noreferrer"` and the new-tab hint; Refresh → a wallet registered meanwhile appears |
| Modal: disabled wallet | same | `no-signMessage` → the button is disabled and described by "This wallet can't sign in to GHOST WIRE." |
| Every §5.2 state's copy and retry | same | `it.each` over the §3.4 rows, driven by `FakeWallet` modes + `mockApi` responses: connecting, challenging, awaiting-signature (preview shows the domain `localhost:3000` from happy-dom's default location, the truncated address and "Devnet"), verifying, done sign-in (`routerMock.replace("/dashboard")` + `refresh`, modal closes), done link ("Wallet linked." + `refresh`), rejected → Try again starts a new challenge (second `challenge` request seen), disconnected → Reconnect, account-changed → Start again, AUTH_FAILED, WALLET_ALREADY_LINKED, NETWORK_UNSUPPORTED, DEPENDENCY_UNAVAILABLE and NETWORK → unreachable copy, INTERNAL → generic. Raw codes never appear in the DOM |
| 429 countdown | same | `vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] })`; `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`; `Retry-After: 3` → "Try again in 3s", button disabled; advance 3 s → enabled and "You can try again now." |
| Abort on close | same | `hang` mode; Escape closes; then resolving anything changes nothing; `calls.signMessage` 1; no `verify` request; reopening shows the wallet list (idle) |
| Account picker | same | `accountCount: 2` → a radio list of both truncated addresses; choosing the second signs with key 2; one account → no picker |
| Use-connect-flow | `tests/ui/wallet-connect/use-connect-flow.test.tsx` | `renderHook`: start → stale attempt events dropped when start is called twice; unmount aborts |
| useWallets | `tests/ui/wallet-connect/use-wallets.test.tsx` | `renderToString` → server snapshot `[]`; a late register re-renders; unregister removes |
| Wallets panel | `tests/ui/components/wallets-panel.test.tsx` | Rows render (address, network label, provider, status badge text, date); "Link another wallet" opens the modal in link mode with the session network; unlink → confirm dialog with exact copy → Confirm → `DELETE /wallets/:id` → toast "Wallet unlinked." + `refresh`; Cancel sends no request; `LAST_WALLET` → alert "You can't unlink your only wallet." in the dialog; current wallet → toast + `replace("/")`; `NOT_FOUND` → `refresh`; disconnected wallet has no Unlink button |
| Sessions panel | `tests/ui/components/sessions-panel.test.tsx` | "This device" on the current row; other → confirm → `DELETE /sessions/:id` → "Session revoked." + `refresh`; current → "Sign out this device" → confirm → toast + `replace("/")`; null user agent → "Unknown device" |
| Dialog focus trap and return, Escape | `tests/ui/ui/dialog.test.tsx` | Opening focuses the first focusable element or `[data-autofocus]`; Tab and Shift+Tab wrap; Escape → `onClose`; closing returns focus to the opener; `aria-labelledby` → title; a closed dialog has no `dialog` role; a native `close` event while `open` → `onClose` |
| Confirm dialog | `tests/ui/ui/confirm-dialog.test.tsx` | Initial focus on Cancel; pending → confirm `aria-busy`; error → `role="alert"` |
| Toast live region | `tests/ui/ui/toast.test.tsx` | `role="status"` and `role="alert"` exist before any toast; info goes to status, error to alert; Dismiss; auto-dismiss at 6000 ms (fake timers) |
| Address copy | `tests/ui/ui/address.test.tsx` | `truncateAddress` cases; full value in sr-only text and `title`; Copy → `navigator.clipboard.writeText(value)` (user-event's clipboard stub) and "Address copied" in the status region; a rejection → "Couldn't copy the address" |
| Button | `tests/ui/ui/button.test.tsx` | Variants render; loading → `aria-busy`/`aria-disabled`, click ignored, label still in the DOM; disabled |
| Menu | `tests/ui/ui/menu.test.tsx` | `aria-haspopup`/`aria-expanded`; ArrowDown opens and focuses the first item; ArrowUp the last; Home/End; Enter selects and closes; Escape closes and returns focus |
| Segmented control | `tests/ui/ui/segmented-control.test.tsx` | `fieldset`/`legend`; arrow keys change the selection (native radios); disabled |
| Spinner | `tests/ui/ui/spinner.test.tsx` | The label is always visible text; the ring is `aria-hidden` |
| Disabled nav items' semantics | `tests/ui/components/app-nav.test.tsx` | Sidebar: Dashboard link with `aria-current="page"` at `/dashboard`; Send/Receive/Payments/Activity are buttons with `aria-disabled="true"`, not links, described by "Soon"; clicking does nothing. Bottom nav: Home, Send, Receive, Activity; no Settings |
| Top bar | `tests/ui/components/top-bar.test.tsx` | Network label text; the menu items; Sign out → `POST /auth/logout` → toast + `replace("/")`; Switch network → modal titled "Connect a wallet" with the other network checked; Copy address → clipboard |
| Session expiry | `tests/ui/components/session-expired-handler.test.tsx` | Mounted + an api call returning `UNAUTHENTICATED` → toast + `replace("/")`; after unmount the handler is gone |
| Unavailable state | `tests/ui/components/service-unavailable.test.tsx` | Copy; Try again → `refresh` |

### 8.3 Integration (Vitest `integration`, MongoMemoryReplSet, handlers called directly)

| Spec item | File | Cases |
|---|---|---|
| §7.1 log levels per status class | `tests/integration/routes/v1/log-levels.test.ts` | `captureLogLines()`: `/me` without a cookie → one `debug` line `{code:"UNAUTHENTICATED",status:401}` and no `error` line; a POST with a foreign Origin → `warn` `{code:"ORIGIN_REJECTED",status:403}` with no `err`/`stack` key; a bad body → `warn` `VALIDATION_FAILED`; a replayed challenge → `warn` `AUTH_FAILED` 401; database down (`useDatabaseUri(stoppedUri)`) → `error` with `err` |
| §7.2 stale cookie | `tests/integration/routes/v1/stale-cookie.test.ts` | Logged-out token → 401 + exactly one `Set-Cookie` equal to `clearSessionCookie`; a malformed value; a revoked session's token; an `http://` origin (`useEnv`) → `gw_session` clear; no cookie → 401 and `setCookies` is `[]`; database down with a cookie → 503 and no `Set-Cookie` |
| §7.3 replace | `tests/integration/routes/v1/session-replace.test.ts` | Same user re-signs in (same `TestClient`, other network) → the old token gets 401, the new one 200, `/sessions` lists one; a different user's wallet signs in on a client holding user A's cookie → A's session is revoked; a `security_events` doc `{type:"session_revoked", reason:"replaced", userId: old user}` exists exactly once; an already revoked or expired previous token → no event; best-effort: `collMod` a validator `{ $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }] }` with `validationAction: "error"` on `sessions` → sign-in still returns 200 with a new cookie, the old session is still active, a `warn` line "previous session revoke failed" with a `code` and no `err`; link verify with a session cookie does not revoke anything |
| §7.4 `slide: false` | `tests/integration/auth/resolve-session-slide.test.ts` | Sign in, advance the clock 2 h, `resolveSession(token, at, { slide: false })` → `slid: false`, `lastSeenAt`/`expiresAt` unchanged in the database; the default call at the same time slides (control) |
| page session | `tests/integration/auth/page-session.test.ts` | `resolvePageSession({ get })` with the configured name → `PageSession`; a malformed value → `null` and no query; another cookie name → `null`; no write after 2 h (as above); database down → throws `DependencyUnavailableError` |

### 8.4 E2E (Playwright, Chromium, `bun run test:e2e`)

Every test uses the `test` from `fixtures.ts`, so the privacy and CSP guards (§3.7) run on all of them. Each test gets a fresh browser context (cookies) and fresh keys (new users).

| Spec flow | File | Steps and assertions |
|---|---|---|
| 1 connect on devnet + sign in | `tests/e2e/sign-in.spec.ts` | Install wallet A → `/` → "Connect wallet" → Devnet is checked → click "GW Test Wallet A" → preview shows `127.0.0.1:3210` → lands on `/dashboard`; the top bar shows "Devnet" and the truncated address; `context.cookies()` has `gw_session` with `httpOnly: true` and `sameSite: "Lax"` |
| 2 reject then retry | same | `setMode("reject")` → "You cancelled the sign-in." → `setMode("approve")` → Try again → `/dashboard`; `signCount()` is 2 |
| 3 disconnect mid-flow | same | `setMode("disconnect")` → "Your wallet disconnected." → approve → Reconnect → `/dashboard` |
| 4 switch to mainnet-beta | `tests/e2e/network-switch.spec.ts` | Sign in on devnet → wallet menu → "Switch to Mainnet-beta" → modal with Mainnet-beta checked and the mainnet note → approve → `/dashboard` shows "Mainnet-beta" → `/settings/sessions` lists exactly one session, marked "This device", with network Mainnet-beta |
| 5 link, unlink, last wallet | `tests/e2e/wallets.spec.ts` | Wallets A and B installed; sign in with A → `/settings/wallets` → "Link another wallet" → B → "Wallet linked." → Close → 2 rows → Unlink B → confirm → "Wallet unlinked." → 1 active row → Unlink A → confirm → "You can't unlink your only wallet." |
| 6 revoke current | `tests/e2e/sessions.spec.ts` | Sign in → `/settings/sessions` → "Sign out this device" → confirm → URL `/`, signed-out CTAs visible, `gw_session` cookie gone |
| 7 signed-out guard | `tests/e2e/guards.spec.ts` | Fresh context → `goto("/settings/wallets")` → final URL `/`; also `/dashboard` and `/settings/sessions` |
| 8 390px | `tests/e2e/mobile.spec.ts` | `test.use({ viewport: { width: 390, height: 844 } })`; sign in → for `/dashboard`, `/settings/wallets`, `/settings/sessions` and `/`: `document.documentElement.scrollWidth <= innerWidth`; `nav[aria-label="Main mobile"]` visible; sidebar hidden; also at 320px for `/` and `/dashboard` |
| axe on every page | `tests/e2e/a11y.spec.ts` | `expectNoSeriousAxeViolations` on `/` (signed out), `/` with the modal open, the modal in awaiting-signature (`hang`), `/dashboard`, `/settings/wallets`, the unlink confirm dialog, `/settings/sessions`, a 404 path, and the wallet menu open |
| privacy | `fixtures.ts` guards (all tests) | §3.7 |
| CSP | `fixtures.ts` guards + `tests/e2e/guards.spec.ts` | Guards on every document; plus an explicit check that `/` has a `content-security-policy` header with `'nonce-`, `'strict-dynamic'` and `frame-ancestors 'none'` and no `unsafe-eval`; `/api/health` has the API CSP; `Referrer-Policy`, `X-Content-Type-Options` and `Permissions-Policy` are present |

### 8.5 Manual

`docs/testing/wallet-compat.md` (§6.7). Results are recorded before merge (acceptance criterion 6).

---

## 9. Spike evidence

All spikes ran in a scratch copy at `/tmp/claude-0/…/scratchpad/arch02b/` (repo copied without `node_modules`, `.next` or `.git`). The repo itself was not modified. Commands are shown relative to the scratch copy.

### 9.0 Setup

```text
$ bun install                          → 418 packages installed, exit 0
$ bun add --exact @wallet-standard/app@1.1.1 @wallet-standard/base@1.1.1 @solana/wallet-standard-features@1.5.0 \
    lucide-react@1.70.0 @fontsource-variable/inter@5.3.0 @fontsource-variable/space-grotesk@5.3.0 geist@1.9.2
$ bun add --exact -d tailwindcss@4.3.5 @tailwindcss/postcss@4.3.5 @testing-library/react@16.3.3 \
    @testing-library/user-event@14.6.8 happy-dom@21.0.4 @playwright/test@1.65.0 @axe-core/playwright@4.14.0
$ bun add --exact @wallet-standard/features@1.1.1
$ for p in …; do npm view $p time --json; done   → table in §0
```

### 9.1 Wallet Standard API

Read from `node_modules/@wallet-standard/app/src/wallets.ts`, `@wallet-standard/base/src/{wallet,window}.ts`, `@wallet-standard/features/src/{connect,events}.ts` and `@solana/wallet-standard-features/src/signMessage.ts`:

- `getWallets(): Wallets`, where `Wallets = { get(): readonly Wallet[]; on<E extends "register"|"unregister">(event, listener: (...wallets: Wallet[]) => void): () => void; register(...wallets): () => void }`. It is a module singleton. On first call in a browser it adds a `wallet-standard:register-wallet` listener (`({ detail: callback }) => callback({ register })`) and dispatches a `wallet-standard:app-ready` event whose `detail` is `{ register }`. With no `window` it skips both and still returns the registry.
- `get()` returns a cached array that is rebuilt only after register/unregister.
- `StandardConnect = "standard:connect"`: `connect(input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>`.
- `StandardEvents = "standard:events"`: `on("change", (p: { chains?; features?; accounts? }) => void) => () => void`.
- `SolanaSignMessage = "solana:signMessage"`, version `"1.1.0" | "1.0.0"`: `signMessage(...inputs: readonly { account: WalletAccount; message: Uint8Array }[]) => Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array; signatureType?: "ed25519" }[]>`.
- `WalletIcon = data:image/${"svg+xml"|"webp"|"png"|"gif"};base64,${string}`.
- **Registration protocol used by the E2E test wallet:** listen for `wallet-standard:app-ready` and call `event.detail.register(wallet)`, **and** dispatch `new CustomEvent("wallet-standard:register-wallet", { detail: ({ register }) => register(wallet) })`. That covers both the app-first and wallet-first orders. Proven end to end in §9.6.

### 9.2 Tailwind v4 + Next 16

`postcss.config.mjs` with `{ plugins: { "@tailwindcss/postcss": {} } }` and `globals.css` with `@import "tailwindcss"; @theme { … }`:

```text
$ bunx next build                       → ✓ (Turbopack), routes listed
$ grep .next/static/chunks/*.css        → --color-violet:#a78bfa
                                           .bg-obsidian{background-color:var(--color-obsidian)}
                                           .rounded-card{border-radius:var(--radius-card)}
                                           .font-heading{font-family:var(--font-heading)}
```

The `postcss.config.mjs` is required. Tailwind v4's Next integration is the PostCSS plugin, and Next only runs it when that file exists.

### 9.3 `next/font/local` from `node_modules`

Paths confirmed by `ls`:
- `node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2`
- `node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2`
- `node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2` (71 212 bytes). `geist/dist/mono.js` itself uses this file with `weight: "100 900"`.

```text
$ bunx next build   → ✓
$ ls .next/static/media → GeistMono_Variable-s.p.….woff2  inter_latin_wght_normal-s.p.….woff2
                          space_grotesk_latin_wght_normal-s.p.….woff2
CSS: @font-face{font-family:inter … } and "inter Fallback", "spaceGrotesk Fallback", "geistMono Fallback"
```

### 9.4 CSP

**Step 1: `script-src 'self'` via `next.config.ts` `headers()`.** `next build && next start -p 3911`, with the Mongo URI pointed at an unused port 27999 (never 27017).

```text
$ curl -sD - http://127.0.0.1:3911/   → Content-Security-Policy: default-src 'self'; script-src 'self'; …
HTML: <script>(self.__next_f=self.__next_f||[]).push([0])</script>
      <script>self.__next_f.push([1,"1:\"$Sreact.fragment\"…</script>     (inline flight data)
$ node spike/probe.mjs http://127.0.0.1:3911/      (Playwright Chromium 158)
button text after click: count 0                  ← not hydrated
error: Executing inline script violates the following Content Security Policy directive 'script-src 'self''. …  (×3)
```

**Step 2: nonce via `src/proxy.ts`** (the Next 16 file convention; `middleware.md` in the installed docs states it is "deprecated in Next.js 16 and renamed to proxy.js", and `proxy.md` states "Proxy defaults to using the Node.js runtime").

```text
build: "ƒ Proxy (Middleware)"; "/" still ○ Static
/      → header has 'nonce-…' 'strict-dynamic'; Cache-Control: s-maxage=31536000 (static)
         probe: count 0; "Loading the script '/_next/static/chunks/….js' violates … script-src 'self' 'nonce-…'"
/dyn   (reads cookies()) → <script … nonce="EI1pecNIgh9nM5NWqZu4cA=="> ; probe: count 1, no CSP errors
```

**Step 3: `await connection()` in the root layout.**

```text
build: ┌ ƒ /   ├ ƒ /_not-found   └ ƒ /dyn
/      → probe: count 1, no CSP errors; Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
/nope  → 404; probe on the not-found page's counter: count 1; only console error is the 404 document itself
/dyn   → count 1
/api/health → Content-Security-Policy: default-src 'none'; frame-ancestors 'none' (from next.config); cache-control: no-store
```

### 9.5 Vitest `ui` project

A config with `{ name: "ui", environment: "happy-dom", include: ["tests/ui/**/*.test.tsx"] }` and **no** `@vitejs/plugin-react`. The test files have no `import React`, so the automatic runtime is in use.

```text
$ bunx vitest run -c vitest.ui-spike.config.ts --silent=false
showModal type: function open: true matches :modal: false
active after open: open                ← focus did NOT move into the dialog
getByRole dialog: true
after Escape open: true closed text: closed 0   ← Escape does nothing natively
after close(): false
clipboard: function matchMedia: function crypto.subtle: object TextEncoder function
✓ 1 passed
```

`happy-dom/lib/nodes/html-dialog-element/HTMLDialogElement.js`: `showModal() { this.setAttribute('open', '') }` and `close()` dispatches `close`. There is no focus handling, no `cancel` and no inertness.

A prototype `Dialog` built to §3.2 passed in happy-dom: initial focus, Tab and Shift+Tab wrap, Escape → closed, focus returned to the opener, no `dialog` role after close (`Tests 1 passed`). `next/link` renders and `aria-current` works with `next/navigation` mocked through `vi.mock`, and `renderToString` works (`Tests 1 passed`).

### 9.6 Playwright, Chromium, Ed25519 and the full E2E path

```text
$ ls ~/.cache/ms-playwright                 → (absent: Chromium not installed)
$ bunx playwright install chromium          → Failed to install browsers
                                              Error: ERROR: Playwright does not support chromium on ubuntu20.04-x64
$ PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64 bunx playwright install chromium
                                            → Chrome Headless Shell 158.0.8127.18 (playwright chromium-headless-shell v1254)
                                              downloaded to /root/.cache/ms-playwright/chromium_headless_shell-1254
                                              (also chromium-1254, ffmpeg-1013)
host: Ubuntu 20.04.6, glibc 2.31; /usr/bin/google-chrome is 127.0.6533.99 (not used)
```

The downloaded browser **runs** on this host without the override at test time (`browser.version()` → `158.0.8127.18`).

WebCrypto Ed25519 in a page on `http://127.0.0.1` (a secure context):

```text
ed25519 {"pub":32,"sig":64,"ok":true,"secure":true}   (generateKey, exportKey raw, sign, verify)
```

`node_modules/playwright/lib/runner/index.js` `createGlobalSetupTasks`: `[createRemoveOutputDirsTask(), ...createPluginSetupTasks(config), …globalTeardowns, ...globalSetups]`. The `webServer` plugin starts **before** `globalSetup`.

Full E2E spike (`MONGOMS_SYSTEM_BINARY=/usr/bin/mongod bunx playwright test`): a global setup with MongoMemoryReplSet 7.0.12, `next build`, and `next start` on 127.0.0.1:3210; a nonce proxy; a client page calling `getWallets()`; the test wallet injected with `page.addInitScript`, importing a Node-generated PKCS#8 key into WebCrypto and registering through both events.

```text
CSP header: default-src 'self'; script-src 'self' 'nonce-F12u66OFPXJSAFi…
cookies: [{"name":"gw_session","httpOnly":true,"sameSite":"Lax","secure":false}]
me status 200                                  ← real server-side Ed25519 verification passed
reject status: error Error: User rejected the request.
axe violations: color-contrast:serious,page-has-heading-one:moderate   (unstyled spike page; axe runs)
csp violations: 0 foreign: 0 addr in url: false
✓ 1 passed (13.3s)
```

The first run failed in `next build`'s type check of `tests/e2e/support/test-wallet.ts`:
`TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BufferSource'`. The fix is `new Uint8Array(input.message)`. Lesson: `next build` type-checks `tests/**`.

### 9.7 Next 16 server APIs (installed d.ts and docs)

```text
dist/server/request/cookies.d.ts:   export declare function cookies(): Promise<ReadonlyRequestCookies>;   (async)
dist/client/components/not-found.d.ts: export declare function notFound(): never;
dist/client/components/redirect.d.ts:  export declare function redirect(…): never   (307; throws NEXT_REDIRECT;
                                       docs: "should be called outside the try block")
next/navigation re-exports: notFound, forbidden, unauthorized, redirect, permanentRedirect, unstable_rethrow
next/server: export { connection } → connection(): Promise<void>
error.md: props { error, retry } (retry stable since v16.3.0); reset() re-renders without re-fetching
staleTimes.md: dynamic default 0 s (since v15.0.0) → router.replace to a dynamic page always fetches
```

### 9.8 ESLint and `zod/mini`

The §2.2 config was written into the scratch `eslint.config.mjs` and formatted with `node node_modules/prettier/bin/prettier.cjs` (the `.bin/prettier` exec-bit issue from the README reproduced). Results:

```text
$ bunx eslint eslint.config.mjs                                  → exit 0
$ node spike/lint-probe.mjs                                      → every §2.4 row as listed (29 cases)
$ bunx eslint src/modules src/instrumentation*.ts src/app/api tests/unit tests/integration tests/helpers tests/setup --max-warnings=0
                                                                 → exit 0 (no regressions)
$ bunx vitest run --project unit tests/unit/lint                 → Tests 28 passed (existing cases)
```

The `client-component.tsx` fixture (JSX) produced no fatal error, so no parser change is needed. Line 6 of `client-imports-server.ts` (dynamic `import("@/modules/database")`) is caught by the esquery selector with the `(?!…)` lookahead.

```text
$ node spike/zm.mjs   (import * as z from "zod/mini")
true false                                         ← unknown key accepted, bad id rejected
{"wallets":[{"id":"aaaa…","status":"active","provider":null}]}   ← unknown key stripped
```

---

## 10. Decisions needing user input

**D1. Playwright Chromium on Ubuntu 20.04.** Playwright 1.65 refuses `bunx playwright install chromium` on ubuntu20.04-x64. With `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64` the download succeeds, and that Chromium 158 runs here (glibc 2.31) and passed the full E2E spike.

| Option | Assessment |
|---|---|
| **(a) Keep Playwright 1.65; README documents the override for Ubuntu 20.04 hosts; acceptance criterion 1 reads "after `bunx playwright install chromium` (with the override on Ubuntu 20.04)" (recommended)** | Verified working. No pin change. Other OSes are unaffected |
| (b) Use the system Chrome (`channel: "chrome"`, 127) | Old, outside Playwright's support window, and Ed25519 WebCrypto support in 127 is unverified. Rejected |
| (c) Downgrade Playwright to the last version that supports 20.04 | Older browser, and no evidence it helps. Rejected |

**D2. Add `@wallet-standard/features@1.1.1` as a direct runtime dependency.** It is not in spec §12, but it is already in the tree transitively, and `wallet-connect` imports its constants and types (`StandardConnect`, `StandardEvents`). **Recommend: add it.** Importing an undeclared transitive package works only through hoisting.

**D3. CSP via nonce, which makes every page dynamic.** The spec pre-approved switching to a nonce if `'self'` fails, and the spike shows it fails. The consequence to acknowledge: no page can be static or CDN-cached (`connection()` in the root layout), and `'strict-dynamic'` is in `script-src`. Every page except 404 is already dynamic because it reads the session, so the practical cost is the 404 page. **Recommend: accept.** Next's experimental SRI mode was not chosen because it is experimental and does not cover the inline flight scripts of dynamic pages.

**D4. Link-mode copy.** The spec's §5.2 copy is written for sign-in. **Recommend** the link-mode variants in §3.4: "Preparing your request…", "Approve the link request in your wallet.", "You cancelled the request.", and "We couldn't verify that signature. Try again." Every other row is shared.

The following are recorded as **[decision]/[clarification]** in the text and do not need input unless the user disagrees:
- the stricter client-import rule (§2.1)
- `<button aria-disabled>` for "Soon" items (§3.3)
- the `choosing-account` state and the `runFlow` option names (§3.1)
- `retry()` instead of `reset()` in error boundaries (§7.5)
- `object-src 'none'` added (§3.6)
- `ABORTED` client code and the 60 s `Retry-After` fallback (§3.1.10)
- the landing page treating an outage as signed out (§4.3)
- UTC date formatting (§3.2)
- toast copy for sign-out, unlink and revoke (§4.3)
