# GHOST WIRE

**Your money. Your business. Your privacy.**

GHOST WIRE is a consumer-friendly, self-custodial private payments application for Solana. The initial product focuses on sending and receiving SOL and USDC using Helius Privacy Rings, with an embedded-wallet path and support for existing wallets such as Phantom and Solflare, subject to verified compatibility.

> **Project status:** Product definition and technical planning. This repository is the source of truth for product intent, design direction, architecture decisions, open questions, and implementation guidance. Documented concepts are not necessarily implemented.

## Start here

- [Product overview](docs/PRODUCT_OVERVIEW.md)
- [Brand identity](docs/BRAND_IDENTITY.md)
- [Frontend design](docs/FRONTEND_DESIGN.md)
- [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [User flows](docs/USER_FLOWS.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Agent guide](docs/AGENT_GUIDE.md)
- [Open decisions](docs/OPEN_DECISIONS.md)

## Product in one paragraph

GHOST WIRE makes supported private SOL and USDC payments approachable. Users can create an embedded wallet or connect an existing supported wallet, initialize privacy functionality, deposit assets into private balances, send confidential transfers, receive payments, and withdraw to public Solana balances. Payment links, QR requests, transaction history, and receipts make the experience useful for everyday users and freelancers/businesses without requiring them to understand the underlying cryptography.

## Locked decisions

| Area | Decision |
|---|---|
| Product name | GHOST WIRE |
| Tagline | Your money. Your business. Your privacy. |
| Audience | Everyday crypto users and freelancers/businesses |
| Interface | Consumer-friendly, suitable for business use |
| Visual direction | Black/graphite, silver, electric violet |
| Chain | Solana |
| Initial assets | SOL and USDC |
| Wallet experience | Embedded plus existing-wallet connection |
| Privacy infrastructure | Helius Privacy Rings |
| MVP | Wallets, private balances, deposits, transfers, withdrawals; then links, QR, history and receipts |
| Token | Not required for MVP; revisit after product usage is validated |

## Core principles

1. **Privacy by default, honestly described.** Explain what is encrypted, what remains visible, and where public/private boundaries occur.
2. **Self-custody.** Users authorize signing. Never collect seed phrases or put private keys in application databases.
3. **Simple experience.** Keep blockchain complexity behind clear payment flows.
4. **Correct payment state.** A payment is not complete merely because a client submitted a transaction or an API returned successfully.
5. **No invented integrations.** Verify Helius SDK APIs, wallet compatibility, asset support, and production readiness against current official documentation.
6. **Lean scope.** Prove reliable SOL and USDC transfers before expanding or introducing token mechanics.

## Important privacy limitation

Do not describe the default permissionless Privacy Ring as anonymous or untraceable. Confidential transfer details such as asset and amount may be encrypted, while sender and recipient addresses and transaction execution remain publicly observable. Deposits and withdrawals are privacy boundary crossings. Confirm exact behavior for each integration path before writing user-facing claims.

## Development rule

Start with repository discovery and a technical proof of concept. The first hard gate is two independently controlled wallets successfully depositing, sending, receiving, and withdrawing both SOL and USDC in the target environment, with correct transaction reconciliation and privacy behavior. Do not build the full payment-link experience on unverified transfer assumptions.
