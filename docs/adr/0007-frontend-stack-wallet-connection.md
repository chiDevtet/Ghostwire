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
- Decisions made during the build (user decisions, listed in "Changes during build" of the spec and
  architecture): `parseChallengePreview` enforces the exact 02a sign-in message layout; cancelled
  confirmations are ignored by the shared `use-confirm-action` hook; every `(app)` page guards itself
  and `shell-state` requires the session's wallet to be active; the E2E privacy guard and exact page
  CSP assertion were widened; the bottom and settings nav mark the active item by colour plus
  `aria-current` only (known gap, kept deliberately).

## Scope / privacy / security impact

- No analytics and no third-party requests (enforced by CSP `connect-src 'self'` and the E2E
  privacy guard). No address, token, session id or wallet id in any URL, title or `localStorage`.
- The app never asks for a seed phrase or private key and only ever requests `signMessage`.
- Copy never claims anonymity or untraceability; it states that sender and recipient addresses can
  remain public on Solana, and connecting a wallet does not mean privacy is set up.
