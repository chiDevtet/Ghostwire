# GHOST WIRE — Application Data Model

**Status:** Proposed logical schema. Adapt to existing database conventions before implementation.

## 1. Data ownership

MongoDB stores application identity, payment-request metadata, transaction lifecycle references, and receipt metadata. It is not a private-balance database or key vault.

Never persist seed phrases, private signing keys, plaintext viewing keys, raw proof secrets, or sensitive decrypted payloads in ordinary logs. Minimize data collection. Encrypt sensitive application metadata at rest where needed. Define retention/deletion policy before public launch.

## 2. Collections

### users

Implemented in PR 02a (owner: `auth`; schema `src/modules/auth/internal/collections.ts`).

- `_id`
- `status`: active | suspended | deleted (new users are active; no API changes it yet)
- `createdAt`, `updatedAt` (`updatedAt` is also the unlink write-skew guard, ADR-0006)

No email and no auth provider field: sign-in is wallet-signature only (ADR-0006). Preferences come later.

### wallets

Implemented in PR 02a (owner: `wallet`; schema `src/modules/wallet/internal/collection.ts`).

- `_id`
- `userId`
- `address`: base58 Solana public key (decodes to exactly 32 bytes)
- `network`: devnet | mainnet-beta
- `walletType`: external (embedded wallets are out of scope until the provider is validated)
- `provider`: nullable informational label matching `^[a-z0-9_-]{1,32}$`, never trusted for behaviour
- `status`: active | disconnected
- `linkedAt` (reset when a disconnected wallet is linked again), `updatedAt`

One account, many wallets: `(address, network)` belongs to exactly one account, and the last active wallet cannot be unlinked. Privacy-initialization and capability fields arrive with the Helius adapter (PR 03). Binding a mainnet-beta wallet does not imply privacy readiness.

### payment_requests
- `_id`
- `publicId`: cryptographically random opaque unique identifier
- `recipientWalletId`
- `asset`: SOL | USDC, validated against registry
- `amountBaseUnits`: nullable for open amount; string, not float
- `descriptionEncrypted`: nullable
- `requestType`: fixed | open
- `status`: pending | paid | expired | cancelled
- `expiresAt`
- payment association
- timestamps

Public request lookup must expose only fields required to pay. Never reveal internal IDs, user email, private wallet metadata, or confidential notes without authorization.

### payments
- `_id`
- `senderWalletId`
- `recipientWalletId` nullable for external/public recipient
- `paymentRequestId` nullable
- `asset`
- `amountBaseUnits`: sensitive; encrypt at rest where stored; string, never JS float
- `transactionSignature` nullable until known
- provider history/reference ID only if non-secret
- `status`: created | awaiting_wallet_authorization | prepared | submitted | confirmed | rejected | failed | expired | reconciliation_required
- `idempotencyKey`
- safe normalized `failureCode`
- timestamps

This is application orchestration/presentation state, not the source of truth for balances. Reconcile with chain/provider state.

### receipts
- `_id`
- `paymentId`
- `receiptId`: opaque unique identifier
- transaction signature/reference
- `issuedAt`
- `verificationStatus`: pending | confirmed | invalid
- safe display metadata or encrypted fields as necessary

An app-generated receipt is not automatically a cryptographic proof of a confidential amount to an unauthorized third party.

### security_events

Implemented in PR 02a (owner: `security`; schema `src/modules/security/internal/events.ts`).

- `_id`
- `type`: signin_success | signin_failed | wallet_linked | link_failed | wallet_unlinked | session_revoked | rate_limited
- `severity`: info | warning | critical (`*_failed` and `rate_limited` are warning; nothing is critical yet)
- `userId` nullable, `walletId` nullable
- `reason`: nullable static string from a fixed list (never request data)
- `createdAt`

Written best effort after commit; never IPs, tokens, nonces, signatures or messages. The `rate_limited` event (and its warn log) is written only on the first rejection in each window; later rejections still return 429 with `Retry-After`.

### sessions

Implemented in PR 02a (owner: `auth`). Opaque tokens; only `sha256(token)` is stored.

- `_id`, `tokenHash`, `userId`, `walletId` (the wallet used to sign in), `network`
- `createdAt`, `lastSeenAt`, `expiresAt` (idle, sliding at most hourly), `absoluteExpiresAt`
- `revokedAt` nullable, `userAgent` nullable (control characters stripped, at most 128 chars)

### auth_challenges

Implemented in PR 02a (owner: `auth`). One signature attempt per challenge.

- `_id` (a random 96-bit ObjectId from `randomObjectId()`, not driver-generated, so ids cannot be guessed and challenges cannot be burned by guessing), `nonceHash` (`sha256(nonce)`), `message` (the exact signed text), `address`, `network`
- `purpose`: signin | link; `userId` (set for link, null for signin)
- `createdAt`, `expiresAt` (5 minutes), `consumedAt` nullable

### rate_limits

Implemented in PR 02a (owner: `security`). Fixed windows.

- `_id`, `key` (`sha256("<route>:<kind>:<subject>")`; the IP exists only inside this hash), `windowStart`, `count`, `expiresAt`

## 3. Indexes

- users: unique normalized email where email auth is used.
- wallets: `wallets_address_network_unique` (address + network, unique); `wallets_userId`.
- auth_challenges: `auth_challenges_nonceHash_unique` (unique); `auth_challenges_expiresAt_ttl` (TTL 3600 s after expiresAt).
- sessions: `sessions_tokenHash_unique` (unique); `sessions_userId`; `sessions_absoluteExpiresAt_ttl` (TTL 0 s).
- rate_limits: `rate_limits_key_windowStart_unique` (unique); `rate_limits_expiresAt_ttl` (TTL 0 s).
- payment_requests: unique publicId; status + expiry.
- payments: unique idempotency scope; transaction signature where present; sender wallet + createdAt; request association.
- receipts: unique receiptId; paymentId.
- security_events: `security_events_userId_createdAt` (userId + createdAt descending); no TTL until a retention policy is approved.

Multi-wallet and multi-network uniqueness is decided in ADR-0006: one (address, network) per account. Indexes are created by `prepareDatabase()` at boot and the `ensureAuthReady()` request gate.

## 4. Amount representation

Use integer base units and strings at persistence/JSON boundaries. Never use binary floating point for financial amounts. Use asset decimals and decimal-safe conversion at display boundaries. Reject excess precision.

## 5. State consistency

- Requests transition pending -> paid, expired, or cancelled.
- Payments have explicit lifecycle and terminal states.
- Duplicate requests cannot cause a second transfer.
- Idempotency is scoped to actor and operation.
- Confirmed chain operation with delayed private history becomes reconciliation_required, not failed.
- TTL cleanup never substitutes for authorization or revocation.

## 6. Privacy and retention

Create a data inventory before beta: data item, purpose, visibility, at-rest encryption, retention, deletion behavior, logging/analytics exposure.

Do not send confidential amount, balance, recipient notes, viewing material, or wallet secrets to analytics. Use privacy-preserving event names and aggregates.
