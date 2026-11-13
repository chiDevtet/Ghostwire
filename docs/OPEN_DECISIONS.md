# GHOST WIRE — Open Decisions and Validation Checklist

This is the source of truth for unresolved decisions. Do not silently invent answers.

## 1. Helius and wallet integration — blocking validation

- [ ] Confirm current Helius TypeScript SDK package/version, installation, API surface. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): SDK page names `@heliuslabs/spr` 0.9.0-alpha but the docs indexes name `@heliuslabs/zolana`; alpha only.
- [ ] Confirm embedded private wallet production availability, onboarding, custody, recovery, signing. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): documented as not live yet; recovery undocumented.
- [ ] Confirm Phantom integration for private balance reads, viewing context and signing. Unanswered by docs as of 2026-11-13 ([ADR-0005](adr/0005-helius-sdk-discovery.md)).
- [ ] Confirm Solflare integration for same. Unanswered by docs as of 2026-11-13 ([ADR-0005](adr/0005-helius-sdk-discovery.md)).
- [ ] Confirm whether external-wallet viewing-key handling differs by provider. Unanswered by docs as of 2026-11-13 ([ADR-0005](adr/0005-helius-sdk-discovery.md)).
- [ ] Confirm SOL support per wallet path. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): SOL supported by protocol and SDK; per-wallet-path support undocumented.
- [ ] Confirm USDC official mint, token program and Ring support per wallet path. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): SPL/Token-2022 supported generically; no USDC mint, token program or per-wallet-path statement.
- [ ] Confirm private recipient initialization requirements. Partially answered — documented for `@heliuslabs/spr` 0.9.0-alpha only; package name unconfirmed (spr vs zolana); see [ADR-0005](adr/0005-helius-sdk-discovery.md).
- [ ] Confirm exact behavior sending to normal public Solana address. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): docs say the SDK can fall back to a public withdrawal; exact call and semantics undocumented.
- [ ] Confirm public SOL fee payer/reserve requirements. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): payer and 5,000-lamport tree fee documented; minimum reserve undocumented.
- [ ] Confirm deposit, transfer, history, withdrawal and confirmation/reconciliation APIs. Partially answered — documented for `@heliuslabs/spr` 0.9.0-alpha only; package name unconfirmed (spr vs zolana); see [ADR-0005](adr/0005-helius-sdk-discovery.md).
- [ ] Confirm production RPC/prover rate limits, pricing, failure modes and support. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): credits, rate limits and error codes published; mainnet status contradictory and no SLA.
- [ ] Review latest audits and formal verification status. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): OtterSec report pending; formal verification status undocumented; reports not yet reviewed.

Record exact docs, SDK version, test date, wallet/provider, cluster, safe transaction signature, and result. Never record private material.

## 2. Product behavior decisions

- [x] Authentication provider and whether email is required. Resolved 2026-11-13: self-hosted wallet-signature auth (SIWS-layout message verified with `node:crypto` Ed25519, opaque hashed server-side sessions); no email and no third-party auth vendor ([ADR-0006](adr/0006-wallet-signature-auth.md)). Evidence: `tests/integration/routes/v1/happy-path.test.ts`, `tests/integration/routes/v1/sign-in-failures.test.ts`, `tests/unit/wallet/ed25519.test.ts` (RFC 8032 §7.1 vectors).
- [x] Multiple wallets per account? Resolved 2026-11-13: yes. One account, many wallets; `(address, network)` belongs to exactly one account (unique index `wallets_address_network_unique`); any linked wallet signs in to the same account; the last active wallet cannot be unlinked ([ADR-0006](adr/0006-wallet-signature-auth.md)). Evidence: `tests/integration/routes/v1/wallets.test.ts`, `tests/integration/auth/unlink-race.test.ts`.
- [ ] Is embedded wallet recommended after provider validation?
- [ ] Canonical first-time recipient onboarding?
- [ ] V1 assets limited to SOL/USDC? (Current plan: yes.)
- [ ] Fixed request expiry defaults and allowed range.
- [ ] Open request minimum/maximum limits.
- [ ] Are payment notes encrypted/stored or omitted from MVP?
- [ ] Receipt fields and exact verification claims.
- [ ] Beta notification channels.
- [ ] Confirmation policy and reconciliation thresholds.
- [ ] Fee policy, if any, and disclosures.
- [ ] Beta access and support process.

## 3. Technical decisions

- [x] Inspect repository before locking package architecture. Resolved 2026-11-12: documentation-only repository; single Next.js app with internal module boundaries ([ADR-0001](adr/0001-single-app-module-boundaries.md)).
- [ ] Confirm Next.js/Bun/TypeScript compatibility with Helius SDK and wallet adapters. Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): SDK is ESM-only with Node `^22.12.0 || >=24` and no pin conflict; browser/edge and Bun installs undocumented; wallet adapters not yet evaluated.
- [x] Confirm MongoDB conventions and whether Mongoose is used. Resolved 2026-11-12: no prior convention and no Mongoose; official driver with Zod schemas ([ADR-0003](adr/0003-mongodb-driver-zod.md)).
- [x] Select auth/session provider. Resolved 2026-11-13: self-hosted; sessions are 32-byte random tokens stored only as SHA-256 hashes, with idle and absolute expiry and per-session revocation ([ADR-0006](adr/0006-wallet-signature-auth.md)). Evidence: `tests/integration/routes/v1/sessions.test.ts`, `tests/integration/routes/v1/persistence.test.ts`.
- [ ] Select KMS/secret manager for application encryption.
- [ ] Select hosting/environment model.
- [ ] Select monitoring/alerting.
- [ ] Define data retention/deletion.
- [ ] Define payment-state source of truth and chain reconciliation.
- [ ] Determine whether confirmation monitoring needs a worker.

## 4. Legal/compliance

- [ ] Qualified review of jurisdictions and payment-services obligations.
- [ ] Sanctions/screening responsibilities.
- [ ] Consumer disclosures and refund/error policies.
- [ ] Privacy policy and terms.
- [ ] Separate review of business payments and future escrow/payroll.
- [ ] Separate review of fee, subscription and token utility.

## 5. Brand and launch

- [ ] Trademark/confusing-name review for GHOST WIRE.
- [ ] Domain availability and acquisition.
- [ ] Social handle availability.
- [ ] Logo originality and export pack.
- [ ] Accessibility/responsive review.
- [ ] Marketing copy reviewed against actual privacy guarantees.

## 6. Decision record format

For each resolved item, record decision, date, owner/approver, rationale, evidence/reference, consequences, and whether it changes scope, privacy guarantees, or security posture.

Until resolved, the item remains an explicit assumption or blocker.

Resolved items are recorded as ADRs in [`docs/adr/`](adr/), using the fields above.
