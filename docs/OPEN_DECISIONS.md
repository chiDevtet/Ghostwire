# GHOST WIRE — Open Decisions and Validation Checklist

This is the source of truth for unresolved decisions. Do not silently invent answers.

## 1. Helius and wallet integration — blocking validation

- [ ] Confirm current Helius TypeScript SDK package/version, installation, API surface.
- [ ] Confirm embedded private wallet production availability, onboarding, custody, recovery, signing.
- [ ] Confirm Phantom integration for private balance reads, viewing context and signing.
- [ ] Confirm Solflare integration for same.
- [ ] Confirm whether external-wallet viewing-key handling differs by provider.
- [ ] Confirm SOL support per wallet path.
- [ ] Confirm USDC official mint, token program and Ring support per wallet path.
- [ ] Confirm private recipient initialization requirements.
- [ ] Confirm exact behavior sending to normal public Solana address.
- [ ] Confirm public SOL fee payer/reserve requirements.
- [ ] Confirm deposit, transfer, history, withdrawal and confirmation/reconciliation APIs.
- [ ] Confirm production RPC/prover rate limits, pricing, failure modes and support.
- [ ] Review latest audits and formal verification status.

Record exact docs, SDK version, test date, wallet/provider, cluster, safe transaction signature, and result. Never record private material.

## 2. Product behavior decisions

- [ ] Authentication provider and whether email is required.
- [ ] Multiple wallets per account?
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
- [ ] Confirm Next.js/Bun/TypeScript compatibility with Helius SDK and wallet adapters.
- [x] Confirm MongoDB conventions and whether Mongoose is used. Resolved 2026-11-12: no prior convention and no Mongoose; official driver with Zod schemas ([ADR-0003](adr/0003-mongodb-driver-zod.md)).
- [ ] Select auth/session provider.
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
