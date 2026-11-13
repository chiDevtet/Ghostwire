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

| Area                   | Decision                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Product name           | GHOST WIRE                                                                                        |
| Tagline                | Your money. Your business. Your privacy.                                                          |
| Audience               | Everyday crypto users and freelancers/businesses                                                  |
| Interface              | Consumer-friendly, suitable for business use                                                      |
| Visual direction       | Black/graphite, silver, electric violet                                                           |
| Chain                  | Solana                                                                                            |
| Initial assets         | SOL and USDC                                                                                      |
| Wallet experience      | Embedded plus existing-wallet connection                                                          |
| Privacy infrastructure | Helius Privacy Rings                                                                              |
| MVP                    | Wallets, private balances, deposits, transfers, withdrawals; then links, QR, history and receipts |
| Token                  | Not required for MVP; revisit after product usage is validated                                    |

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

## Development setup

### Prerequisites

- **Node 24** (`.nvmrc`; `nvm use`). Node is the only runtime ([ADR-0002](docs/adr/0002-bun-tooling-node-runtime.md)).
- **Bun 1.4.4**, used only as the package manager and script runner.
- **MongoDB 7.0+ as a replica set** for local development (transactions need one). Tests start their own in-memory replica set.

### First run

```bash
bun install --frozen-lockfile
cp .env.example .env.local        # then edit values; never commit .env files
mkdir -p .data/db
mongod --replSet rs0 --dbpath ./.data/db --bind_ip 127.0.0.1 &
mongosh --quiet --eval "rs.initiate()"
bun run dev                       # http://localhost:3000, /api/health, /api/ready
```

The server validates configuration at boot and exits with code 1 if any key is missing or invalid.
The error names the keys, never their values. This applies to `bun run dev` as well as
`bun run start`: after a bad `.env`, fix it and restart the server.

### Configuration

| Key                     | Required             | Description                                                                        |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `MONGODB_URI`           | yes                  | `mongodb://` or `mongodb+srv://` connection string (replica set for transactions)  |
| `MONGODB_DB_NAME`       | yes                  | 1–63 chars of `A-Z a-z 0-9 _ -`                                                    |
| `LOG_LEVEL`             | no                   | `debug`, `info` (default), `warn` or `error`                                       |
| `NODE_ENV`              | set by tooling       | `development`, `test` or `production`. Set by Next.js and Vitest                   |
| `MONGOMS_SYSTEM_BINARY` | tests only, optional | Path to a local `mongod` 7.0.x (e.g. `/usr/bin/mongod`) instead of downloading one |

### Scripts

| Command                                          | What it does                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `bun run dev`                                    | Next.js dev server                                                  |
| `bun run build`                                  | Production build (works without a `.env`)                           |
| `bun run start`                                  | Serve the production build                                          |
| `bun run lint`                                   | ESLint, including the module boundary rules (zero warnings allowed) |
| `bun run typecheck`                              | `next typegen` then `tsc --noEmit`                                  |
| `bun run test`                                   | All Vitest projects (unit + integration)                            |
| `bun run test:unit` / `bun run test:integration` | One project only                                                    |
| `bun run test:coverage`                          | Tests with a V8 coverage report in `coverage/` (no threshold)       |
| `bun run format` / `bun run format:check`        | Prettier write / check                                              |

> **Never run `bun test`.** It starts Bun's built-in test runner, not Vitest. Always use `bun run test`.

On hosts without a downloadable MongoDB build (for example Ubuntu 20.04), export
`MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` before running tests.

**Known issue:** Bun can install `node_modules/prettier/bin/prettier.cjs` without the execute bit, so
`bun run format` and `bun run format:check` fail with exit 126 "Permission denied" on some hosts. Run
`node node_modules/prettier/bin/prettier.cjs --check .` (or `--write <files>`) instead.

### Module boundaries

Application code lives in `src/modules/<name>/`, each with a public `index.ts` and a flat `internal/`
directory ([ADR-0001](docs/adr/0001-single-app-module-boundaries.md)). `bun run lint` enforces:

1. Outside a module, import only `@/modules/<name>`. Deep imports (`@/modules/<name>/internal/...`) are errors.
2. Files under `src/modules/**` never import from `src/app/**`.
3. Only `src/modules/database/**` may import `mongodb`.
4. Only `src/modules/config/**` may read `process.env` (exceptions: tooling config files, `src/instrumentation.ts`, test setup).

The rules also cover dynamic `import()` and `require()`. The lint scopes are an allowlist of paths, so a
new top-level directory (such as `scripts/` or `tests/e2e/`) or new extensions (such as `.mts` or `.js`)
need their own scope in `eslint.config.mjs`.

All logging goes through the redacting logger in `@/modules/shared`; `console.*` is not allowed in `src/`.

### Decisions

Stack decisions are recorded in [`docs/adr/`](docs/adr/). Open questions live in
[`docs/OPEN_DECISIONS.md`](docs/OPEN_DECISIONS.md).
