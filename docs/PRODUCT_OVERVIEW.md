# GHOST WIRE — Product Overview

**Tagline:** Your money. Your business. Your privacy.  
**Status:** Product definition / pre-implementation.

## 1. Product vision

GHOST WIRE is a self-custodial private payment experience for Solana. It makes confidential digital-asset payments approachable for everyday crypto users, freelancers, independent developers, and businesses.

The product is not a general-purpose wallet or a new privacy protocol. Its job is to make payment actions easy: connect or create a wallet, fund a private balance, send or receive SOL/USDC, and understand each payment's status.

## 2. Problem

Public blockchains make payment activity easy to inspect. A payer may expose transaction amounts, asset types, wallet relationships, and surrounding wallet activity. Users who want to pay a contractor, receive freelance income, or send money to another person may unintentionally reveal more financial context than intended.

GHOST WIRE addresses confidentiality of supported transfer details using Helius Privacy Rings, wrapped in a consumer-friendly payment application.

## 3. Target users

### Everyday Solana users
People who already use crypto and want more confidentiality when moving supported assets.

### Freelancers and independent developers
People receiving client payments who do not want every payment amount to become public financial context.

### Crypto businesses and small teams
Organizations making contributor, contractor, or service-provider payments. Business tooling is a later extension; MVP is not a full payroll or treasury platform.

Design for both audiences from the start, but prioritize a simple consumer flow rather than two separate products.

## 4. Promise and boundaries

### Promise
Make supported SOL and USDC payments easier to make confidentially, while preserving user authorization and clear transaction status.

### Do not promise
- Complete anonymity or untraceability.
- Hiding sender and recipient addresses when the selected Ring exposes them.
- Hiding public deposits, withdrawals, or all wallet activity.
- Privacy from GHOST WIRE's own application systems if information is stored or disclosed there.
- That an app-generated receipt independently proves a confidential amount to every third party.
- That all wallets, tokens, and transaction paths behave identically.

Always distinguish onchain confidentiality, application-data privacy, and wallet custody.

## 5. MVP scope

### Core payment foundation (P0)
- Embedded wallet path, subject to verified provider availability and recovery behavior.
- Existing wallet path, initially Phantom and Solflare where compatible.
- Wallet ownership authentication/connection state.
- Privacy initialization and wallet context handling.
- Supported asset registry for SOL and official USDC mint.
- Private balance reads.
- Public-to-private deposits.
- Confidential private-to-private transfers.
- Private-to-public withdrawals.
- Transaction preparation, signing, submission, confirmation, and reconciliation.
- Clear fee-reserve information, including public SOL required for Solana fees where applicable.
- Failure, retry, timeout, and duplicate-submission handling.

### Payment experience (P1, after transfer proof)
- Fixed-amount and open-amount payment requests.
- Shareable links with opaque identifiers.
- QR generation and scanning.
- Request expiration and cancellation.
- Payment history and detail.
- App-generated receipts.
- First-time recipient onboarding and clear public/private receiving-path disclosure.

### Later (P2 / post-MVP)
- Notifications.
- Business profiles and invoicing.
- Contractor payout workflows.
- Merchant tools.
- Recurring payment orchestration.
- Programmable escrow, only after separate technical/security design.
- Developer API/SDK after core flows stabilize.

## 6. Explicit non-goals for MVP

- GHOST WIRE token, staking, governance, or token-gated basic privacy.
- Fiat rails, bank accounts, debit cards, fiat on/off ramps.
- Cross-chain support or swaps.
- Custom privacy circuits or a custom Ring.
- Building a wallet protocol or blockchain.
- Native iOS/Android apps.
- Complex DeFi analytics.
- Full merchant acquiring, payroll, or enterprise treasury suite.

## 7. Differentiators

1. Payment-first experience: send/receive are primary tasks.
2. Payment links: make a confidential payment request shareable.
3. QR payments: support in-person requests and scanning.
4. Simple receipts: give both parties an understandable record and transaction reference.
5. Two wallet paths: embedded onboarding plus external-wallet support.
6. Business-aware design: room for invoices and payouts later.

Helius is the underlying infrastructure, not GHOST WIRE's differentiation by itself. GHOST WIRE's value is UX, payment request workflows, transaction clarity, recipient onboarding, and support.

## 8. Primary success criteria

The first technical milestone is two independently controlled wallets completing both SOL and USDC flows:
- initialize privacy functionality;
- deposit;
- read private balances;
- transfer;
- recipient sees funds using their authorized wallet context;
- reconcile transaction and private history;
- withdraw.

The first product beta should additionally measure wallet initialization rate, first deposit completion, successful/attempted payments, payment request completion, repeat users, failure rate, confirmation time, proof/RPC consumption, recovery success, and support incidents.

Do not use token price, market capitalization, or social engagement as product success metrics.

## 9. Business model direction (not MVP dependency)

Potential later revenue options include clearly disclosed application fees where appropriate, premium business features, subscriptions, and developer usage plans. Any discounts or token utility must follow real usage and legal review. Basic privacy should not be artificially locked behind token ownership.

## 10. Product copy principles

Preferred:
- “Your money. Your business. Your privacy.”
- “Send privately. Receive confidently.”
- “Financial privacy, simplified.”
- “Transmission complete.” (Only after confirmed transaction completion.)

Avoid “invisible,” “untraceable,” “anonymous,” or absolute guarantees unless a specific independently verified feature supports the claim.
