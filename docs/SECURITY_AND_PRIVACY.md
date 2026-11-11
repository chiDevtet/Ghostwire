# GHOST WIRE — Security and Privacy Requirements

**Status:** Required engineering baseline. Not a security audit or legal opinion.

## 1. Security posture

GHOST WIRE handles money and privacy-sensitive financial context. Self-custody does not eliminate application security obligations. Helius privacy primitives do not automatically make all application data private.

Treat three separate domains:
1. Onchain confidentiality.
2. Application-data privacy.
3. Wallet/key custody and authorization.

## 2. Wallet/key requirements

- Never store seed phrases or private signing keys in MongoDB.
- Never transmit seed phrases to GHOST WIRE backend.
- Never log seed phrases, private keys, viewing keys, or proof secrets.
- Do not invent key recovery or viewing-key custody.
- Validate embedded provider custody boundaries, recovery semantics, and signing.
- Keep signing authorization with the user-controlled wallet flow.
- Follow provider-approved mechanisms for viewing-key storage/isolation.
- Revoke sessions and disconnect wallets securely.
- Reauthenticate sensitive account/session actions where appropriate.

## 3. Authentication and ownership

For wallet-signature authentication:
- Use cryptographically random nonce.
- Bind challenge to domain, wallet, network, and expiry.
- Verify signature server-side.
- Consume nonce once.
- Prevent replay.
- Rate-limit challenge creation/verification.
- Never treat an address string as proof of ownership.

Use secure HTTP-only SameSite cookies where suitable. Protect state-changing requests against CSRF. Avoid long-lived tokens in localStorage.

## 4. Privacy and data minimization

- Do not put amounts, invoice descriptions, wallet secrets, or viewing keys in URLs.
- Do not include confidential amounts/balances in analytics.
- Redact sensitive fields from logs, traces, and error reports.
- Encrypt sensitive application metadata at rest when needed.
- Restrict database access by least privilege.
- Use TLS in transit.
- Do not cache plaintext sensitive balances in shared server caches.
- Minimize retention and define deletion rules.
- Never claim the whole application is private merely because onchain amount fields are encrypted.

## 5. Transaction authorization and correctness

Every transaction requires verified user/wallet context, server-controlled asset validation, destination validation, amount precision/bounds validation, explicit user review, wallet authorization, unique idempotency key, signature association, onchain execution verification, private-history/balance reconciliation, and safe retry/recovery logic.

Never trust frontend success flags, client-supplied balances, client transaction status, or arbitrary mint addresses.

## 6. Privacy boundary disclosures

Default permissionless Ring behavior must be described accurately. Confidential asset/amount fields do not imply anonymous sender/recipient addresses.

At minimum:
- Deposit: public-side funding/source/destination/program interaction may be observable.
- Private transfer: explain which fields are confidential and which addresses remain visible.
- Withdrawal: public-side details may be observable.
- Public recipient: explain that it is not the same as crediting a recipient's private balance.
- Receipt: distinguish app-generated confirmation from independent cryptographic disclosure of amount.

## 7. Web application security

- Strict server-side authorization.
- Runtime schema validation for all external input.
- Content Security Policy.
- Secure CORS.
- Rate limits on auth, requests, balance reads, and expensive privacy operations.
- Dependency/supply-chain scanning.
- Secret manager/KMS for server secrets and encryption keys.
- Database least privilege/network restrictions.
- Webhook authentication and replay protection if introduced.
- No secrets in client bundles.
- Errors must not leak sensitive provider payloads.

## 8. Threat model

| Threat | Mitigation |
|---|---|
| Public observer inspects transfers | Correct confidential route; disclose public addresses |
| Database breach | Data minimization, encryption, least privilege |
| Log/analytics leak | Structured redaction, event allowlist |
| Stolen session | Secure cookies, expiry, revocation |
| Wallet spoofing | Signed challenge and server verification |
| Malicious payment link | Opaque random IDs, origin validation, confirmation |
| Double click/replay | Idempotency and one-time challenges |
| RPC timeout ambiguity | Reconcile before retry |
| Compromised frontend | CSP, dependency controls, explicit wallet review |
| Viewing-key leakage | Provider-approved isolation/storage; no logging |
| Unauthorized receipt access | Ownership authorization and opaque IDs |

## 9. Required testing

Wallet signature replay; authorization boundaries; CSRF/session; input/precision; idempotency and concurrent request; confirmation/reconciliation; logging redaction; secret scanning; dependency scanning; embedded recovery; Phantom/Solflare disconnect/rejection; deposit/transfer/withdraw for each asset; mainnet review.

## 10. Operations

Monitor transaction success/failure, reconciliation queue, proof errors, RPC errors/timeouts, credit consumption, suspicious auth, rate limits, wallet initialization and recovery failures.

Create incident procedures for provider outage, suspected key compromise, data breach, incorrect payment status, and transaction duplication.

## 11. Legal/compliance review

Before public mainnet operation, obtain qualified review of applicable money-transmission/payment-services obligations, jurisdictions served, sanctions/screening, consumer disclosures, privacy policy/data retention, business/merchant payments, and future fee/subscription/token mechanics.

Self-custody does not automatically resolve every regulatory question.
