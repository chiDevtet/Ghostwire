# GHOST WIRE — PR 02b Wallet Connect UI and App Shell: Design Spec

**Date:** 2026-11-13
**Status:** Approved in brainstorming; pending written-spec review
**Roadmap item:** PR 02 (Authentication and wallet abstraction), second half: "External wallet connection", "Phantom/Solflare compatibility validation", "signing rejection/disconnect states work"
**Builds on:** PR 02a auth API (`docs/specs/2026-11-13-auth-api-design.md`, ADR-0006), merged as PR #2

## 1. Goal

Ship the first designed, user-facing slice of GHOST WIRE:
- a design-system foundation
- the app shell
- the connect-wallet and sign-in flow, with every failure state handled honestly
- settings pages for linked wallets and active sessions

It uses the 02a `/api/v1` endpoints unchanged except for three small backend follow-ups (§7). Nothing in this PR claims or implies privacy capability. Private balances and payments come in later PRs.

## 2. Decisions made in brainstorming

| # | Decision | Alternatives rejected |
|---|---|---|
| B1 | Scope: design-system foundation, app shell, connect and sign-in flow with all edge states, settings for wallets (link and unlink) and sessions (list and revoke), and a short landing hero with two CTAs | Adding the full marketing landing page; a minimal connect and sign-in only |
| B2 | Wallets are discovered and connected through Wallet Standard directly: `@wallet-standard/app` plus `@solana/wallet-standard-features` types and our own hooks. No `@solana/web3.js` v1 | `@solana/react` (kit hooks) before PR 03 pins kit; classic `@solana/wallet-adapter-react` (web3.js v1) |
| B3 | Styling uses Tailwind CSS v4 with brand tokens in `@theme`, our own accessible primitives (native `<dialog>`), Lucide icons, and self-hosted fonts | shadcn/ui (Radix); CSS Modules |
| B4 | Testing has three layers: Vitest + React Testing Library + happy-dom with a fake Wallet Standard wallet; Playwright E2E with an injected test wallet that signs with real Ed25519, plus axe; and a manual Phantom and Solflare checklist on devnet | Component tests plus manual only; Playwright plus manual only |
| B5 | Three backend follow-ups from 02a are in scope: 4xx log level, clearing a stale cookie on 401, and revoking the old session on re-sign-in | Deferring them |
| B6 | The user picks the network in the connect flow. Default is Devnet. Mainnet-beta carries a "private payments not available yet" note. Switching network means signing in again | Devnet-only UI; following the wallet's reported chain |
| B7 | Architecture is a server-first shell with client islands. Server components read the session directly; wallet work happens in client components that call `/api/v1` | Client-only SPA; Server Actions for auth |

## 3. Scope

### In scope
- Design tokens, fonts, and primitives under `src/ui/`.
- App shell:
  - top bar with the wordmark, network indicator, wallet status menu and settings link
  - desktop sidebar
  - mobile bottom nav
- Landing hero at `/`, signed-in dashboard placeholder at `/dashboard`, `/settings/wallets`, and `/settings/sessions`.
- The client-only `wallet-connect` module: registry, hooks, sign-in and link flow state machine, and typed API client.
- The connect-wallet modal in two modes, sign-in and link.
- The three backend follow-ups (§7) and `resolveSession(..., { slide })`.
- A CSP and security headers.
- Error and not-found pages.
- ADR-0007 for the frontend stack and wallet connection. README sections for UI development and E2E. `docs/testing/wallet-compat.md`.

### Out of scope
- Embedded wallet creation.
- Privacy initialization or any Helius call (PR 03).
- Balances, send, receive, payments, activity, receipts (later PRs).
- The full marketing landing page, FAQ, and legal pages.
- Final logo artwork.
- A light theme.
- Notifications.
- Native apps.
- CI workflow (Ship phase).

## 4. Structure

```text
src/
  app/
    layout.tsx                        fonts (next/font/local), globals.css, ToastRegion
    globals.css                       @import "tailwindcss"; @theme brand tokens; base styles
    page.tsx                          landing hero (server; signed-in-aware CTA)
    error.tsx, not-found.tsx
    (app)/layout.tsx                  server: resolve session (no slide) → redirect("/") | AppShell
    (app)/error.tsx
    (app)/dashboard/page.tsx
    (app)/settings/wallets/page.tsx
    (app)/settings/sessions/page.tsx
  modules/
    wallet-connect/                   client-only module
      index.ts
      internal/registry.ts            getWallets(); capability filter; register/unregister subscription
      internal/use-wallets.ts         useSyncExternalStore over the registry
      internal/flow.ts                pure reducer and state types for sign-in/link
      internal/run-flow.ts            effectful driver: wallet calls + API calls → reducer events
      internal/errors.ts              wallet error classification (rejected / disconnected / other)
      internal/api-client.ts          typed /api/v1 client returning ApiResult
      internal/schemas.ts             Zod response schemas (client copies)
      internal/base58.ts              bs58 encode for signatures
  ui/                                 primitives, no domain logic
    button.tsx, card.tsx, dialog.tsx, badge.tsx, spinner.tsx, toast.tsx,
    address.tsx, network-indicator.tsx, wallet-status.tsx, ghost-logo.tsx, skip-link.tsx
  components/                         feature components (ui + wallet-connect)
    app-shell/ (sidebar.tsx, top-bar.tsx, bottom-nav.tsx, app-shell.tsx)
    connect-wallet-modal.tsx, connect-button.tsx,
    wallets-panel.tsx, sessions-panel.tsx, session-expired-handler.tsx
tests/
  unit/wallet-connect/*.test.ts       reducer, errors, registry, api-client
  ui/**/*.test.tsx                    new Vitest project "ui" (happy-dom + RTL)
  helpers/fake-wallet.ts              in-memory Wallet Standard wallet with scripted modes
  e2e/*.spec.ts                       Playwright
  e2e/support/test-wallet.ts          init script: Wallet Standard register + WebCrypto Ed25519
  e2e/support/global-setup.ts         MongoMemoryReplSet + build/start app
docs/adr/0007-frontend-stack-wallet-connection.md
docs/testing/wallet-compat.md
```

### Boundary rules (ESLint, with fixture tests)
1. `src/modules/wallet-connect/**`, `src/ui/**` and `src/components/**` must not import `@/modules/{database,auth,security,config}`, `mongodb`, `bson`, or `node:*`.
2. Server modules (`src/modules/{shared,validation,config,database,wallet,security,auth}/**`) must not import `@/modules/wallet-connect`, `@/ui/*` or `@/components/*`.
3. Only `src/app/**` may import `next/headers` and `next/navigation`'s server functions (`redirect`, `notFound`).
4. `src/ui/**` must not import `@/modules/wallet-connect` or `@/components/*`.
5. `bs58` may be imported only by `src/modules/wallet/internal/base58.ts` and `src/modules/wallet-connect/internal/base58.ts`. Tests and helpers keep their existing exemption.

All PR 01 and 02a rules still apply.

## 5. Components and interfaces

### 5.1 `wallet-connect`

- **`registry.ts`**
  - Wraps `getWallets()` from `@wallet-standard/app`.
  - `listSolanaWallets(): WalletEntry[]`, where `WalletEntry = { id, name, icon, canSignIn: boolean, wallet }`.
  - `canSignIn` is true only when the wallet has `standard:connect` and `solana:signMessage`, and at least one of its `chains` starts with `solana:`.
  - Wallets that lack `solana:signMessage` are listed with `canSignIn: false`.
  - `subscribe(listener): () => void` listens to the `register` and `unregister` events.
- **`use-wallets.ts`**: `useWallets(): WalletEntry[]`, built on `useSyncExternalStore`. The server snapshot is `[]`.
- **`flow.ts`**
  - Mode is `"sign-in" | "link"`.
  - States:
    - `idle`
    - `connecting`
    - `challenging`
    - `awaiting-signature { preview: { domain, address, network } }`
    - `verifying`
    - `done`
    - `rejected`
    - `disconnected`
    - `account-changed`
    - `rate-limited { retryAt }`
    - `failed { code, message }`
  - The pure `reduce(state, event)` covers every transition. Each attempt carries an `attemptId`, and events from a stale attempt are ignored.
- **`run-flow.ts`**: `runFlow({ mode, wallet, account?, network, attemptId, signal, dispatch, api })`. Sequence:
  1. `standard:connect`.
  2. Pick the account: the first one, or the user's choice when there are several.
  3. Challenge: `POST /auth/challenge` for sign-in, `/wallets/link/challenge` for link.
  4. `solana:signMessage` over `new TextEncoder().encode(message)`.
  5. Base58-encode the signature.
  6. Verify. A `standard:events` `change` subscription stays active for the whole attempt.
  7. `AbortSignal` cancels the attempt when the modal closes.
- **`errors.ts`**: `classifyWalletError(e): "rejected" | "disconnected" | "other"`.
  - `rejected`: code `4001`, a name or message matching `/reject|denied|cancel/i`, or a `WalletSignMessageError` with a user-rejection cause.
  - `disconnected`: a name or message matching `/disconnect|not connected/i`.
  - Anything else is `other`.
- **`api-client.ts`**: `ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; retryAfter?: number }`.
  - Functions: `challenge`, `verify`, `logout`, `me`, `listWallets`, `linkChallenge`, `linkVerify`, `unlinkWallet`, `listSessions`, `revokeSession`.
  - Every call sends `credentials: "same-origin"` and `cache: "no-store"`.
  - Mapping:
    - a non-JSON or schema-mismatched body gives `UNEXPECTED_RESPONSE`
    - a `fetch` rejection gives `NETWORK`
    - a 429 reads `Retry-After` in seconds
  - It never throws.
- **Session expiry**: `onUnauthenticated(handler)` registers one global handler. `SessionExpiredHandler` uses it to show a toast and call `router.replace("/")`. It applies only inside `(app)`.

### 5.2 Connect-wallet modal

- **Network**: a segmented control with "Devnet" (default) and "Mainnet-beta". On mainnet-beta, a note reads: "Private payments aren't available on mainnet yet. Signing in only links your wallet."
- **Wallet list**: each wallet's own name and icon.
  - If no wallets are found: install links for Phantom and Solflare (plain external links, `rel="noopener noreferrer"`) and a Refresh button.
  - A wallet with `canSignIn: false` is shown disabled, with the text "This wallet can't sign in to GHOST WIRE."
- **Account picker**: shown only when the wallet returns more than one account.
- **Status copy**:

| State | Copy |
|---|---|
| connecting | "Connecting to {wallet}…" |
| challenging | "Preparing your sign-in…" |
| awaiting-signature | "Approve the sign-in request in your wallet." plus preview: domain, address (mono, truncated), network |
| verifying | "Verifying…" |
| done (sign-in) | "Your wallet is connected." → navigate to `/dashboard` |
| done (link) | "Wallet linked." → refresh list |
| rejected | "You cancelled the sign-in." + Try again |
| disconnected | "Your wallet disconnected." + Reconnect |
| account-changed | "Your wallet switched accounts. Start again with the new account." + Start again |
| rate-limited | "Too many attempts. Try again in {n}s." The retry button is disabled until the countdown ends |
| failed AUTH_FAILED | "We couldn't verify that signature. Request a new sign-in." |
| failed WALLET_ALREADY_LINKED | "That wallet is linked to another GHOST WIRE account." |
| failed NETWORK_UNSUPPORTED | "That network isn't available right now." |
| failed DEPENDENCY_UNAVAILABLE / NETWORK | "We can't reach GHOST WIRE right now. Check your connection and try again." |
| failed other | "Something went wrong. Try again." |

- Every retry starts a new attempt with a new challenge.
- Closing the modal aborts the attempt.

### 5.3 Shell and pages

- **Top bar**:
  - the `GhostLogo` text wordmark
  - `NetworkIndicator`: a badge showing the session's network as text ("Devnet" / "Mainnet-beta") plus a dot; colour is never the only signal
  - `WalletStatus`: a menu button showing the truncated address, with items Copy address, Switch network, Sign out
  - a link to settings
- **Sidebar** (≥ 768px): Dashboard; Send, Receive, Payments, Activity shown disabled with "Soon" (`aria-disabled="true"`, not links); Settings.
- **Bottom nav** (< 768px): Home; Send, Receive, Activity disabled with "Soon". On mobile, Settings is reached from the top-bar menu.
- **Landing `/`**:
  - Hero headline: "Your money. Your business. Your privacy."
  - Supporting line: "Private SOL and USDC payments on Solana, with clear privacy boundaries."
  - A privacy-limits sentence: "Private payments are coming in a later release. Sender and recipient addresses can remain public on Solana."
  - CTAs:
    - Signed out: "Open GHOST WIRE" (opens the modal) and "Connect wallet" (opens the modal).
    - Signed in: "Open dashboard" instead.
- **Dashboard**:
  - "Your wallet is connected."
  - The signed-in wallet address and network.
  - The number of linked wallets.
  - A card: "Private balances arrive in a later release." Nothing is fabricated: no balances, no zero values.
- **Wallets page**: a list showing address, network badge, provider, status and linked date. "Link another wallet" opens the modal in link mode.
  - Unlink asks for confirmation in a dialog: "Unlinking removes this wallet from your GHOST WIRE account. It doesn't affect funds on-chain."
  - `LAST_WALLET` shows: "You can't unlink your only wallet."
  - Unlinking the wallet you are signed in with ends the session: the server clears the cookie, and the page shows a toast and redirects to `/`.
- **Sessions page**: a list showing a "This device" marker for the current session, network, user agent (truncated), last seen and expiry.
  - Revoking another session asks for confirmation and refreshes the list.
  - Revoking the current session signs you out and returns you to `/`.
- **Sign out**: `POST /auth/logout`, then `router.refresh()` and `router.replace("/")`.
- **Switch network**: opens the modal in sign-in mode, preset to the other network. On success the server revokes the old session (§7.3).

## 6. Design system

- **Tokens**: in `@theme`, with exact values from BRAND_IDENTITY §3:
  - `--color-obsidian: #09090E`
  - `--color-surface: #111118`
  - `--color-elevated: #17151F`
  - `--color-border: #292936`
  - `--color-text: #FFFFFF`
  - `--color-muted: #A1A1AA`
  - `--color-silver: #C4C4CE`
  - `--color-violet: #A78BFA`
  - `--color-violet-hover: #8B5CF6`
  - `--color-success: #34D399`
  - `--color-warning: #FBBF24`
  - `--color-error: #FB7185`
  - Radii: cards `16px`, buttons and inputs `10px`. Spacing on a 4px scale.
  - Motion: 150–250ms. Under `prefers-reduced-motion: reduce` there are no transitions or animations, and the spinner becomes a static indicator with text.
- **Theme**: dark only.
- **Violet**: limited to primary buttons, the selected nav item, focus rings, and brand accents.
- **Fonts**: self-hosted through `next/font/local`, so there is no build-time or runtime third-party fetch:
  - `@fontsource-variable/space-grotesk` for headings
  - `@fontsource-variable/inter` for body and controls
  - `geist` (Geist Mono) for addresses and numeric detail
- **Icons**: `lucide-react`, always next to a visible text label.
- **Logo**: `GhostLogo` renders a text wordmark until the final artwork is approved (BRAND_IDENTITY §4). No generated artwork.

### Primitives
- `Button`: variants primary, secondary, ghost, danger. The loading state sets `aria-busy` and keeps the button's width. Disabled is styled and announced.
- `Dialog`: native `<dialog>` with `showModal()`. Escape closes it and focus returns to the trigger. The title is wired through `aria-labelledby`.
- `Card`, `Badge`.
- `Spinner`: reduced-motion aware.
- `Toast`: a polite live region. Errors are announced with `role="alert"`.
- `Address`: mono and truncated as `AbCd…WxYz`. The full value is available in visually hidden text and `title`. The copy button announces "Address copied".
- `SkipLink`.

### Accessibility
- Semantic landmarks and headings.
- Visible focus rings (violet, 2px offset).
- Touch targets ≥ 44px.
- Status is never conveyed by colour alone.
- Keyboard operable throughout.
- Works without horizontal scroll from 320px.

## 7. Backend changes (02a follow-ups)

1. **4xx log level** (`shared/internal/http.ts` `toErrorResponse`):
   - 5xx and unknown errors stay at `error`, with `err`.
   - `UNAUTHENTICATED` (401) is logged at `debug`.
   - Every other status below 500 is logged at `warn` with `{ code, status }` only, with no `err` object and no stack.
2. **Stale cookie** (`auth/internal/wrappers.ts` `withSession`): when the request carried a session cookie (any non-empty value under either cookie name) and no session was resolved, the 401 includes `Set-Cookie: clearSessionCookie(...)`. A request with no cookie gets no `Set-Cookie`.
3. **Replace the old session on re-sign-in** (verify route, `auth/internal/sign-in.ts`):
   - After the new session commits, verify reads the request's existing session token. If it resolves (no slide), that session is revoked with an atomic `revokedAt: null` filter, the same mechanism logout uses.
   - This happens even when the old session belongs to a different user.
   - A `session_revoked` event is recorded with the new static reason `replaced`.
   - Best-effort: if the revoke fails, it is logged at `warn` and the sign-in still returns 200 with the new cookie.
   - Link verify does not revoke anything.
4. **`resolveSession(token, opts?: { slide?: boolean })`**: the default is `true`, which keeps the existing behaviour. With `slide: false` it never writes. Server components use `slide: false`.

## 8. Data flow

- **Server pages**:
  - `(app)/layout.tsx` and `page.tsx` read the cookie with `cookies()` from `next/headers`, then call `resolveSession(token, { slide: false })` and `getMe`.
  - With no session, the `(app)` layout calls `redirect("/")`.
  - A `DependencyUnavailableError` renders a "We can't reach GHOST WIRE right now" state.
  - These pages are dynamic (`cookies()`), and their responses carry `Cache-Control: no-store`.
- **Client**:
  - The modal and panels call `api-client`.
  - After sign-in, sign-out, link, unlink or revoke, they call `router.refresh()` so the server components re-read the session. Navigation uses `router.replace`.
- **Privacy**:
  - No address, token, session id or wallet id is ever put in a URL path, query string, `<title>`, metadata or `localStorage`. Routes are fixed, and per-item ids travel only in request bodies or route segments of `/api/v1` calls made with `fetch`.
  - The `/api/v1` `DELETE` routes use ids in their path, but those are API requests, not navigations.
  - No analytics. No third-party requests of any kind.

## 9. Security headers

Set in `next.config.ts` `headers()` for all routes:
- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self'`; if Next 16 needs inline bootstrap scripts, then a per-request nonce through middleware instead; the plan verifies which is needed and documents it
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data:`, because Wallet Standard icons are data URIs
  - `font-src 'self'`
  - `connect-src 'self'`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

In development, `'unsafe-eval'` is allowed only when `NODE_ENV=development` (needed for React refresh). Production never includes it.

## 10. Error handling

- `app/error.tsx` and `(app)/error.tsx` show "Something went wrong." with a "Try again" button that calls `reset()`. They show the error's `digest` if present, and never the message or stack.
- `not-found.tsx` is styled to match.
- API errors surface only through the copy in §5.2 and the panel equivalents. Raw codes are never shown to users.

## 11. Testing

- **Unit** (Vitest, node):
  - every `flow.ts` transition, including stale-attempt events being ignored
  - `classifyWalletError` across the standard code, Phantom-style and Solflare-style error shapes, and the fallback
  - registry capability filtering, and late `register` and `unregister` events
  - api-client mapping for each error code, `Retry-After`, `NETWORK` and `UNEXPECTED_RESPONSE`
- **Component**: a new Vitest project `ui` (happy-dom, React Testing Library, user-event) with `FakeWallet` modes approve, reject, disconnect, switch-account, hang and no-signMessage. Covers:
  - Modal: network default and the mainnet note; empty state; disabled wallet; every §5.2 state's copy and retry; the 429 countdown; abort on close; account picker.
  - Wallets panel: link, unlink confirm, `LAST_WALLET`, unlinking the current wallet.
  - Sessions panel: revoking another session vs the current one.
  - Primitives: dialog focus trap and focus return, Escape, the toast live region, `Address` copy, the disabled nav items' semantics.
- **Integration** (existing Mongo project):
  - §7.1 log levels per status class
  - §7.2 the clear on 401 with a stale cookie, and no `Set-Cookie` without a cookie
  - §7.3 replacing a same-user session and a different-user session, the `replaced` event, and the best-effort failure path
  - §7.4 `slide: false` never writes
- **E2E** (Playwright, Chromium, `bun run test:e2e`, kept separate from `bun run test`):
  - Global setup starts `MongoMemoryReplSet` (`MONGOMS_SYSTEM_BINARY`) and runs `next build` + `next start` with `APP_ORIGIN=http://127.0.0.1:<port>`. The cookie is therefore `gw_session`.
  - The test wallet is injected with `page.addInitScript`. It registers through the Wallet Standard `wallet-standard:register-wallet` event, signs with WebCrypto Ed25519 so the server's verification is real, and has modes switched through `window.__gwTestWallet`.
  - Flows:
    1. Connect on devnet and sign in. Lands on the dashboard; the network indicator and address are visible; the cookie is HttpOnly.
    2. Reject the signature, then retry successfully.
    3. Disconnect mid-flow.
    4. Switch to mainnet-beta. The old session is absent from the sessions page.
    5. Link a second wallet, unlink it, then attempt to unlink the last wallet.
    6. Revoke the current session. Lands on `/`.
    7. Visit `/settings/wallets` while signed out. Redirects to `/`.
    8. At a 390px viewport there is no horizontal scroll and the bottom nav is visible.
  - Every page gets an axe scan (`@axe-core/playwright`), allowing zero serious or critical violations.
  - A privacy assertion records every request and navigation during the run. No URL contains any test wallet address, and no request leaves the app origin.
  - A CSP assertion checks that the header is present on page responses and that no console CSP violations appear.
- **Manual**: `docs/testing/wallet-compat.md` has a results table covering Phantom and Solflare, on a desktop extension and a mobile in-app browser, on devnet. Each run checks connect, sign-in, sign rejection, wallet disconnect, account switch, link and unlink. Each row records the date, browser, wallet version and result. Rows are filled in only from actual runs.
- **Boundary**: lint fixture tests for each §4 rule.

## 12. Dependencies

Exact pins, choosing the newest stable release at least 7 days old at plan time. The plan re-checks these candidates as of 2026-11-13.

| Package | Candidate | Kind |
|---|---|---|
| `@wallet-standard/app` | 1.1.1 | runtime |
| `@wallet-standard/base` | 1.1.1 | runtime |
| `@solana/wallet-standard-features` | 1.5.0 | runtime |
| `lucide-react` | 1.70.0 | runtime |
| `@fontsource-variable/inter` | 5.3.0 | runtime |
| `@fontsource-variable/space-grotesk` | 5.3.0 | runtime |
| `geist` | 1.9.2 | runtime |
| `tailwindcss` | 4.3.5 | dev |
| `@tailwindcss/postcss` | 4.3.5 | dev |
| `@testing-library/react` | 16.3.3 | dev |
| `@testing-library/user-event` | 14.6.8 | dev |
| `happy-dom` | 21.0.4 | dev |
| `@playwright/test` | 1.65.0 | dev |
| `@axe-core/playwright` | 4.14.0 | dev |

Packages that are not added: `@solana/web3.js`, `@solana/kit`, `@solana/wallet-adapter-*`, Radix/shadcn, any analytics, any CSS-in-JS.

## 13. Acceptance criteria

1. A fresh clone with no `.env` passes `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun run test && bun run build`. After `bunx playwright install chromium`, `bun run test:e2e` also passes.
2. Every §5.2 state has a component test, and E2E flows 1–8 pass.
3. axe reports zero serious or critical violations on every page.
4. The CSP and security headers are present. No third-party requests. No sensitive value in any URL.
5. The §7 backend changes are tested.
6. `docs/testing/wallet-compat.md` exists, and its results for Phantom and Solflare on devnet are recorded before merge.
7. ADR-0007 records B2, B3 and B4, and the README documents the UI stack, `test:e2e`, and the Chromium install.
8. No copy claims anonymity or untraceability, or implies privacy is initialized.

## 14. Risks

- **Wallet error shapes vary.** Phantom and Solflare report rejection differently. `classifyWalletError` falls back to "other", which shows a generic retry, and the manual checklist confirms the real shapes.
- **CSP vs Next inline scripts.** If `script-src 'self'` breaks hydration, we switch to nonce middleware. The plan includes a spike step that decides this.
- **Mobile in-app browsers.** Wallet Standard injection timing differs there. Late registration is handled through the `register` event, and the manual checklist covers it.
- **Playwright browser download.** The Chromium download needs network access. E2E is a separate script so the core gates stay offline-capable.

## Changes during build (2026-11-14)

- ESLint: wallet-connect may not import `@/ui`/`@/components` (rule `wcUi`); root `src/*.ts`, `instrumentation.ts`, `proxy.ts` may not import `next/headers` or server `next/navigation`.
- `parseChallengePreview` enforces the exact 11-line 02a sign-in layout (statement, URI `http(s)://<domain>`, Version, Chain ID index 7, nonce, round-tripping timestamps), not only domain/address/network (user decision).
- Dialog captures its opener in a `useLayoutEffect` so a child focusing on mount cannot become the focus-return target.
- New `src/components/use-confirm-action.ts` shared by the wallets and sessions panels; results of cancelled confirmations are ignored (user decision).
- Each `(app)` page guards itself (redirect to `/` when signed out, outage section when unavailable) because client navigation does not re-run the layout; `shell-state` requires the session's wallet to be active (user decision).
- E2E: crash-safe teardown, `GW_E2E_PORT` honored, privacy guard covers localStorage/sessionStorage/IndexedDB, every title and every page in the context; page CSP asserted exactly (user decision).
- Known gap kept by user decision: the active item in the bottom nav and settings nav is marked by colour plus `aria-current` only.
