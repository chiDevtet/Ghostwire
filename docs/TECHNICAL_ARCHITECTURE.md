# GHOST WIRE — Technical Architecture

**Status:** Proposed architecture. Provider/SDK details require validation before implementation.

## 1. Goals

- Separate product logic from Helius-specific SDK calls.
- Preserve user-authorized signing and self-custody.
- Support embedded and existing wallets through explicit adapters.
- Support SOL and official USDC through a server-controlled asset registry.
- Make transaction state durable and reconcilable.
- Keep initial deployment simple: modular monolith, not microservices.
- Do not store private balances, keys, seed phrases, or plaintext viewing keys in MongoDB.

## 2. Proposed stack

| Layer | Proposed choice |
|---|---|
| Web | Next.js App Router |
| Language | TypeScript strict |
| Runtime/package manager | Bun |
| Database | MongoDB / existing repository convention |
| Blockchain | Solana |
| Privacy | Helius Privacy Rings SDK / documented RPC |
| Wallets | Embedded + Phantom/Solflare where compatible |
| Validation | Zod |
| Forms | React Hook Form |
| Server data | TanStack Query where suitable |
| Monitoring | Sentry or equivalent |

Inspect the repository before forcing any technology choice. If conventions differ, record an ADR before changing them.

## 3. Logical architecture

1. Frontend: landing, auth, dashboard, payment screens, settings.
2. Application API: auth, wallet registration, request creation, payment metadata, receipts, rate limits.
3. Wallet adapters: embedded/external connection, signing, recovery handoff.
4. Privacy adapter: sole application boundary for Helius Privacy SDK/RPC.
5. Payment orchestration: validation, state machine, idempotency, reconciliation.
6. Persistence: users, wallet references, requests, payment state, receipts, safe operational events.
7. Solana/Helius: execution, proofs, private reads, confirmation.

### Suggested modules
- wallet
- privacy
- payments
- blockchain
- database
- security
- validation
- shared

For a lean first iteration these can remain modules inside one application.

## 4. Repository structure proposal

This is guidance, not a mandate to impose a monorepo if unnecessary:

```text
apps/web/
  app/
    (public)/
    (auth)/
    (dashboard)/
    pay/
    api/
  components/
  features/
packages/
  wallet/
  privacy/
  payments/
  blockchain/
  database/
  security/
  validation/
  shared/
tests/
  unit/
  integration/
  e2e/
  security/
docs/
```

## 5. Wallet model

### Embedded
- Use a verified Helius-supported embedded-wallet integration.
- Confirm key generation, custody, recovery, signing, viewing-key flow, and production availability.
- Do not invent a recovery process.
- Do not store private keys or seed phrases server-side.
- Persist only provider metadata that is safe and necessary.

### External
- Initial targets Phantom and Solflare where exact signing and SDK flows are documented/tested.
- Verify ownership with a signed challenge: nonce, expiry, domain, wallet and network binding.
- Handle rejection/disconnect.
- Disconnecting does not delete onchain assets.
- A connected wallet is not automatically privacy-initialized.

Create provider-neutral interfaces but preserve meaningful provider differences with explicit capabilities.

## 6. Privacy adapter

No application module except the adapter should call Helius privacy methods directly. Map internal types to real SDK types only after checking current official docs and installed SDK declarations.

Illustrative internal interface—not Helius method names:

```ts
interface PrivacyProvider {
  initializeWallet(context: WalletContext): Promise<WalletPrivacyContext>;
  getPrivateBalances(context: WalletPrivacyContext): Promise<PrivateBalance[]>;
  deposit(request: DepositRequest): Promise<PreparedOperation>;
  transfer(request: PrivateTransferRequest): Promise<PreparedOperation>;
  withdraw(request: WithdrawRequest): Promise<PreparedOperation>;
  getPrivateHistory(context: WalletPrivacyContext, cursor?: string): Promise<PrivateHistoryPage>;
}
```

A separate signer interface must show explicitly who signs and where keys reside. Never put key material in serializable DTOs or logs.

## 7. Asset support

V1: native SOL and USDC SPL token using the verified official mint for the selected cluster.

Server-controlled asset registry fields:
- symbol;
- mint (null for native SOL);
- decimals;
- token program;
- cluster;
- enabled status;
- Ring support/initialization status;
- applicable limits.

Verify official asset identifiers and onchain configuration before enabling mainnet. Do not accept arbitrary mint addresses from clients. Use integer base units as strings or decimal-safe arithmetic; never JS floating point for money.

## 8. Transaction lifecycle

Suggested states:

```text
created
  -> awaiting_wallet_authorization
  -> prepared
  -> submitted
  -> confirmed

Terminal/exception states:
  rejected
  failed
  expired
  reconciliation_required
```

Never mark confirmed because a user clicked send, a wallet returned a signature, an API returned HTTP success, or an optimistic update ran.

Define confirmation as successful onchain execution plus the required private-history/balance reconciliation. Account for chain success while the browser disconnects.

Every attempt needs an idempotency key. Retry only after reconciliation determines whether the previous attempt executed.

### Public/private boundaries
- Deposit: disclose public-side funding/source/destination/program interaction may be observable.
- Private transfer: use documented confidential route.
- Withdrawal: disclose funds leave private balance and public-side amount/destination may be observable.
- Ordinary public recipient: verify documented route; don't imply it credits a private balance.

## 9. Payment requests

Requests are application records, not the confidential transfer itself. Use opaque random IDs. Never encode amount, invoice detail, viewing keys, wallet secrets, or signing material in URLs.

Store recipient wallet reference, asset, optional fixed amount, optional encrypted description, expiry, status, and payment association. Validate ownership and state server-side. Public lookup returns only safe fields.

First-time recipient flows must be tested. A public address is not automatically a private receiving balance.

## 10. Confirmation and reconciliation

A transaction coordinator should persist intent before submission; associate authorization/signature; verify chain execution; distinguish failed execution from transport uncertainty; query private history/balance through authorized context; update payment/receipt status; and emit redacted operational events.

Recover from browser interruption, RPC timeout, delayed signature visibility, delayed private history, and resubmission.

## 11. Proposed application APIs

These are GHOST WIRE endpoints, not Helius endpoints; adjust to repository conventions.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/v1/me | Authenticated user |
| GET | /api/v1/wallets | Registered wallets |
| POST | /api/v1/wallets/connect | Register verified external wallet |
| POST | /api/v1/wallets/initialize | Initialize supported privacy capability |
| GET | /api/v1/balances | Authorized private balance read |
| POST | /api/v1/deposits/prepare | Prepare deposit |
| POST | /api/v1/transfers/prepare | Prepare transfer |
| POST | /api/v1/transfers/submit | Coordinate submitted transfer |
| POST | /api/v1/withdrawals/prepare | Prepare withdrawal |
| GET | /api/v1/payments | Payment records |
| POST | /api/v1/requests | Create request |
| GET | /api/v1/requests/:id | Public-safe request details |
| POST | /api/v1/requests/:id/pay | Associate/coordinate payment |
| GET | /api/v1/receipts/:id | Authorized receipt |

All private endpoints require authentication and authorization. A public request endpoint reveals only information intended for the payer.

## 12. Infrastructure

Initial deployment:
- one web/API application;
- MongoDB;
- Helius RPC/prover integration;
- server-side secret manager/KMS for application encryption secrets;
- error/performance monitoring;
- rate limiting and alerts.

No microservices needed for MVP.

## 13. Cost and capacity

Provider pricing and limits can change. Verify current costs before launch. Instrument proof calls per action, reads per session, retries, failed proofs, credits per completed payment, cost per success, rate limits, and timeouts.

Avoid unnecessary balance refreshes. Cache only safe data and never place plaintext sensitive data in shared caches.

## 14. Integration validation gate

Before building dependent UX, verify:
1. Current Helius SDK package, version, TypeScript surface, and examples.
2. Embedded-wallet production availability, recovery, signer behavior, supported environments.
3. Phantom/Solflare signing and viewing-key flows.
4. SOL support by wallet path.
5. USDC mint, token program, and Ring support.
6. Deposit, private transfer, history, withdrawal.
7. Private recipient initialization and public-recipient behavior.
8. Fee-payer and public SOL reserve.
9. Confirmation/reconciliation API behavior.
10. Current limits, pricing, failures, and production support.

Record exact version, doc links, date tested, cluster, wallet, safe test signature, and result. Never invent SDK methods or endpoints.
