# GHOST WIRE — Application Data Model

**Status:** Proposed logical schema. Adapt to existing database conventions before implementation.

## 1. Data ownership

MongoDB stores application identity, payment-request metadata, transaction lifecycle references, and receipt metadata. It is not a private-balance database or key vault.

Never persist seed phrases, private signing keys, plaintext viewing keys, raw proof secrets, or sensitive decrypted payloads in ordinary logs. Minimize data collection. Encrypt sensitive application metadata at rest where needed. Define retention/deletion policy before public launch.

## 2. Collections

### users
- `_id`
- `email` nullable, normalized and unique where appropriate
- `authProvider`
- `status`: active | suspended | deleted
- `preferences`: display currency, notifications, privacy display preference
- `createdAt`, `updatedAt`

Do not assume email is the only authentication method.

### wallets
- `_id`
- `userId`
- `walletAddress`
- `walletType`: embedded | external
- `provider`
- `network`: devnet | mainnet-beta
- `privacyInitialized` (cache/status only, not sole proof of readiness)
- capability flags and last validation time
- `status`: active | disconnected | recovery_required
- timestamps

No private keys or seed phrases. Persist only safe, necessary provider identifiers. Define multi-wallet-per-user and uniqueness semantics explicitly.

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
- `_id`
- `userId` nullable
- `eventType`
- `severity`: info | warning | critical
- source/category
- timestamp
- safe metadata only

Never log keys, viewing material, auth tokens, sensitive notes, or unnecessary financial data.

### sessions (if not handled by auth provider)
Use secure session records with expiry/revocation and minimized device metadata. Store hashed token identifiers, not bearer tokens in plaintext.

## 3. Indexes

- users: unique normalized email where email auth is used.
- wallets: wallet address + network; userId.
- payment_requests: unique publicId; status + expiry.
- payments: unique idempotency scope; transaction signature where present; sender wallet + createdAt; request association.
- receipts: unique receiptId; paymentId.
- security_events: userId + timestamp; TTL only under an approved retention policy.

Confirm uniqueness rules for multi-wallet and multi-network support.

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
