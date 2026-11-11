# GHOST WIRE — Implementation Roadmap

**Status:** Proposed PR sequence; not existing issues or committed work.

## Guiding rule

Prove the Helius integration and two-wallet payment path before building the full payment-request experience. Keep PRs small and reviewable. Do not implement undocumented SDK methods or assume feature availability.

## Stage 0 — Repository and documentation discovery

Before code:
- Inspect repository, branches, package manager, workflows, deployment and conventions.
- Read this documentation set.
- Identify current Helius SDK package/version and supported APIs from official docs.
- Record decisions in ADRs.
- Create environment templates only for known configuration; never commit secrets.

Deliverable: repository baseline and validated integration plan.

## Stage 1 — Foundation

### PR 01: Project foundation
- App structure and build/test baseline.
- TypeScript strictness and linting.
- Environment validation.
- MongoDB connection/repository boundary.
- Shared errors and validation.
- Health/readiness checks.

Acceptance: reproducible setup; build, lint and tests pass; no secrets; environment documented.

## Stage 2 — Wallet integration

### PR 02: Authentication and wallet abstraction
- Auth integration.
- External wallet connection.
- Phantom/Solflare compatibility validation.
- Signed challenge authentication.
- Wallet registration and session management.

Acceptance: ownership verified server-side; replay resistance tested; signing rejection/disconnect states work.

### PR 03: Helius integration spike and privacy adapter
- Install verified Helius SDK package/version.
- Map official SDK types to internal adapter.
- Validate embedded wallet capability and production availability.
- Validate external-wallet privacy flow.
- Implement initialization/read operations only where verified.
- Document provider limitations.

Acceptance: no guessed endpoints/methods; at least one supported wallet path initializes in target test environment; embedded path decision recorded; sensitive context handled safely.

## Stage 3 — Assets and transaction engine

### PR 04: Asset registry and private balances/deposits
- Server-controlled SOL/USDC configuration.
- Verify official USDC mint and token program.
- Decimal-safe amounts.
- Private balance reads and deposits.
- Public SOL fee reserve display.

Acceptance: asset identifiers verified; both assets have test evidence; UI never fabricates balances.

### PR 05: Private transfer engine
- Prepare/sign/submit lifecycle.
- Proof generation through verified provider SDK.
- Idempotency.
- Transaction monitoring.
- Confirmation and reconciliation.
- Retry/timeout behavior.

Acceptance: two independent wallets transfer SOL and USDC in target test environment; no duplicate payment on retry; confirmed/submitted/failed are distinct; recipient state verified.

### PR 06: Withdrawals and history
- Withdraw both assets.
- Private history reads.
- Activity persistence/reconciliation.
- Public-boundary disclosures.

Acceptance: full deposit/transfer/withdraw lifecycle for both assets; browser interruption and delayed-history tests pass.

## Stage 4 — Payment product UX

### PR 07: Payment requests and links
- Fixed/open requests.
- Opaque IDs.
- Expiry/cancellation.
- Request/payment association.
- First-time recipient route.
- Safe public request view.

Acceptance: no sensitive URL data; already-paid/expired requests cannot be paid twice; privacy route is disclosed and verified.

### PR 08: QR and receipts
- QR generation/scanning.
- Manual fallback.
- Receipt view/sharing.
- Explorer reference.
- Status reconciliation.

Acceptance: QR works on supported mobile browsers; receipt accurately describes verification; no unsupported cryptographic-proof claims.

## Stage 5 — Security and release

### PR 09: Hardening
- Authorization audit.
- Rate limits.
- Secret management.
- Logging redaction.
- CSP and web security.
- Dependency scanning.
- Monitoring/alerting.
- Security test suite.

Acceptance: critical/high findings resolved or explicitly block release; alerts and incident procedure documented.

### PR 10: Mainnet beta
- Mainnet configuration.
- Verified asset/Ring setup.
- Production provider account and limits.
- Wallet-path acceptance testing.
- Beta allowlist and support.
- Terms, privacy policy, disclosures.
- Rollback/disable switches.

Acceptance: real mainnet SOL/USDC transfers proven with low-risk tests; support/monitoring active; privacy behavior checked; legal/compliance gates complete.

## Frontend workstream (can use demo data in parallel)

1. Brand tokens, typography, logo placeholders.
2. Application shell and responsive navigation.
3. Landing page and onboarding.
4. Dashboard and asset cards.
5. Send/review flow.
6. Receive/request/QR flow.
7. Activity and transaction detail.
8. Receipt screens.
9. Settings/recovery.
10. Accessibility and responsive polish.

Do not connect mocked UI state to real payments before the transaction engine is validated.

## Dependency chain

Foundation -> wallet/auth -> Helius adapter -> asset/balance/deposit -> transfer engine -> withdrawal/history -> payment requests -> QR/receipts -> hardening -> mainnet beta.

## Release gates

### Gate A: Technical proof
Two independent wallets complete deposit, balance read, transfer, receipt/history reconciliation, and withdrawal for SOL and USDC.

### Gate B: Product beta
A nontechnical user completes a payment-link flow, understands privacy implications, and interprets transaction status without assistance.

### Gate C: Mainnet
Security, provider configuration, asset support, monitoring, legal review, recovery, and incident response are approved.

## PR hygiene

Every PR includes scope/rationale, files/modules, acceptance criteria, tests/environments, security/privacy impact, provider documentation/version references, and known limitations.

Never merge a PR that silently changes product privacy promises or wallet custody assumptions.
