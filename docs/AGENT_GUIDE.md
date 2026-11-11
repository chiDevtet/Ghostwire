# GHOST WIRE — Coding Agent Guide

This file is intended for coding agents and engineers working in this repository.

## 1. Read before acting

Read:
1. `README.md`
2. `docs/PRODUCT_OVERVIEW.md`
3. `docs/BRAND_IDENTITY.md`
4. `docs/FRONTEND_DESIGN.md`
5. `docs/TECHNICAL_ARCHITECTURE.md`
6. `docs/DATA_MODEL.md`
7. `docs/USER_FLOWS.md`
8. `docs/SECURITY_AND_PRIVACY.md`
9. `docs/IMPLEMENTATION_ROADMAP.md`
10. `docs/OPEN_DECISIONS.md`

## 2. Locked decisions

- Product: GHOST WIRE.
- Tagline: “Your money. Your business. Your privacy.”
- Visual: black/graphite, silver, electric violet.
- Audience: everyday crypto users and freelancers/businesses; consumer-friendly interface.
- Chain: Solana.
- Initial assets: SOL and USDC.
- Wallet options: embedded and existing wallets such as Phantom/Solflare, subject to verified compatibility.
- Privacy infrastructure: Helius Privacy Rings.
- MVP: private payments; payment links, QR, activity and receipts follow transfer proof.
- No token dependency in MVP.

Do not rename product or change locked decisions without an explicit product decision.

## 3. First action on any coding task

Inspect repository state before editing:
- Read existing README and package files.
- Inspect source structure/conventions.
- Check current branch and git status if tools allow.
- Identify existing architecture and tests.
- Reuse standards rather than adding duplicates.
- Report discoveries that conflict with this planning documentation.

The docs describe intended product direction, not proof that a framework or file structure already exists.

## 4. Helius integration rules

- Consult current official Helius Privacy documentation and SDK package/types before implementation.
- Never invent SDK method names, RPC URLs, parameters, error codes, or embedded wallet capabilities.
- Cite exact documentation/version in PR notes.
- Keep Helius-specific code behind the privacy adapter.
- Keep signing/private context in the appropriate user-controlled/provider-supported path.
- Validate embedded wallet production status, recovery and signer behavior.
- Treat Phantom/Solflare as separate compatibility targets.
- Validate SOL and official USDC support per wallet path and cluster.
- Verify public-recipient behavior.
- Treat deposits and withdrawals as privacy boundary crossings.

Official starting point: https://www.helius.dev/docs/privacy

## 5. Security rules — never violate

- Never request or commit seed phrases/private keys.
- Never log keys, seed phrases, viewing keys, proof secrets, or sensitive payment payloads.
- Never store private signing keys in MongoDB.
- Never trust client-supplied balance or transaction status.
- Never mark payment complete on optimistic UI or API submission alone.
- Enforce server-side authorization.
- Validate assets against server-controlled registry.
- Use integer base units/decimal-safe math; no floating point for amounts.
- Implement idempotency/reconciliation before retrying uncertain transactions.
- Avoid sensitive query strings, analytics payloads, and logs.
- Do not invent wallet recovery.
- Do not make legal/compliance assumptions.

## 6. Privacy language

The default permissionless Ring must not be described as anonymous or untraceable. Sender and recipient addresses can remain visible even where asset and amount are confidential. Deposits and withdrawals may reveal public-side details.

Distinguish onchain confidentiality, application-data confidentiality, and wallet custody/authorization.

An app receipt is not automatically independent cryptographic proof of amount. Describe it accurately.

## 7. Engineering standards

- Prefer small, focused PRs.
- Preserve project conventions.
- Use strict types and runtime validation at trust boundaries.
- Keep domain logic out of UI components.
- Use explicit transaction state machines.
- Test failure paths, not only happy paths.
- Make operations observable without logging sensitive details.
- Document environment variables without committing secrets.
- Avoid unnecessary services/dependencies.
- No token, staking, swaps, or out-of-scope features in MVP.

## 8. Stop and document an open decision when

- Official docs do not clearly support an operation.
- SDK types differ from planning interface.
- Wallet recovery/custody is unclear.
- SOL or USDC Ring configuration is unverified.
- Public recipient path changes privacy guarantees.
- Transaction status cannot be reconciled safely.
- A feature materially changes scope or legal posture.

For minor implementation choices, use simplest approach consistent with repository conventions and document it.

## 9. PR handoff format

Every coding PR states:
- What changed and why.
- Roadmap acceptance criteria satisfied.
- Relevant official Helius references/version.
- Tests and environments run.
- Privacy/security implications.
- Known gaps/follow-up.

Do not claim production readiness based only on devnet mocks.
