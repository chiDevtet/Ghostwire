# ADR-0006: Self-hosted wallet-signature auth with server-side sessions

- **Status:** Accepted
- **Date:** 2026-11-13
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decisions A1–A5)

## Decision

GHOST WIRE authenticates users only by proof of Solana wallet ownership, with no email, password or
third-party auth vendor (A1). The backend API ships first as PR 02a; the branded connect UI follows
as PR 02b (A2).

- **Accounts (A3).** One account, many wallets. The first sign-in creates the account. A signed-in
  user can link more wallets, and any linked wallet signs in to the same account.
  `(address, network)` belongs to exactly one account (unique index
  `wallets_address_network_unique`). Unlinking the last active wallet is refused (`LAST_WALLET`).
- **Networks (A4).** `devnet` and `mainnet-beta` are both accepted from the start, through the
  `SOLANA_NETWORKS` allowlist (default: both).
- **Proof (A5).** The server builds a Sign-In-With-Solana message (CAIP-122 layout) and verifies
  the Ed25519 signature with `node:crypto`. No Wallet Standard `solana:signIn` helper and no JWT.
- **Ed25519 key hygiene.** Verification rejects small-order and non-canonical public keys before
  calling `node:crypto`. Otherwise the eight small-order points allow universal forgery: for
  example the all-zero address `11111111111111111111111111111111` is a small-order key.
- **Sessions (A5).** Opaque 32-byte random tokens (base64url) in an HttpOnly cookie. Only
  `sha256(token)` is stored, in `sessions`.

### Message format (UTF-8, `\n` line endings, no trailing newline)

```
{domain} wants you to sign in with your Solana account:
{address}

Sign in to GHOST WIRE. This does not authorize any transaction or move funds.

URI: {origin}
Version: 1
Chain ID: solana:{network}
Nonce: {nonce}
Issued At: {issuedAt}
Expiration Time: {expiresAt}
```

`domain` is the host of `APP_ORIGIN` and `origin` is `APP_ORIGIN`. The nonce is 16 random bytes
as base64url. Both timestamps are ISO-8601 UTC with milliseconds; a challenge expires 5 minutes
after issue. Link challenges use the statement `Link this wallet to your GHOST WIRE account. This
does not authorize any transaction or move funds.` Only `sha256(nonce)` is stored as a field; the
nonce otherwise exists only inside the stored message. `auth_challenges._id` is a random 96-bit
ObjectId (`randomObjectId()`), not driver-generated, so challenge ids cannot be guessed and
challenges cannot be burned by guessing. A challenge is consumed atomically by one
`findOneAndUpdate`, outside the sign-in transaction, so one challenge allows one signature attempt.

### Session model

| Property | Value |
|---|---|
| Cookie (https `APP_ORIGIN`) | `__Host-gw_session=<token>; Path=/; Max-Age=<s>; HttpOnly; Secure; SameSite=Lax` |
| Cookie (http, local dev) | `gw_session=<token>; Path=/; Max-Age=<s>; HttpOnly; SameSite=Lax` |
| Idle lifetime | `SESSION_IDLE_DAYS` (default 7), sliding, written at most once per hour |
| Absolute lifetime | `SESSION_MAX_DAYS` (default 30), never extended |
| Revocation | `revokedAt` (logout, `DELETE /sessions/:id`, unlinking the wallet the session was created with) |
| CSRF | `Origin` must equal `APP_ORIGIN` on every non-GET request; `SameSite=Lax` is defence in depth |

### Mechanics decided in the architecture

- `bs58` 6.0.0 is the base58 decoder (approved 2026-11-13). Only
  `src/modules/wallet/internal/base58.ts` imports it in `src/`. PR 03 may swap it for
  `@solana/kit`'s codec behind the unchanged `wallet` API.
- Indexes are created by `prepareDatabase()` at boot (`src/instrumentation-node.ts`) and by the
  `ensureAuthReady()` request gate, both through the memoized `ensureIndexesOnce()`. An
  `INDEX_CONFLICT` at boot exits with code 1; an unreachable database at boot is deferred to the
  first request.
- Every variable filter value goes through `safeEquals`; server constants are written literally
  (approved 2026-11-13).
- **Client IP.** With `TRUST_PROXY=true` the client IP is the rightmost `X-Forwarded-For` entry,
  the one appended by the nearest trusted proxy (earlier entries are client-controlled). It is
  normalized: IPv4-mapped IPv6 becomes dotted IPv4, IPv6 is canonical lowercase compressed, and
  values with a zone id (`%`) become `unknown`. This assumes exactly one appending proxy hop.
- **Rate-limit events.** The `rate_limited` security event and its warn log are written only on the
  first rejection in each window; later rejections still return 429 with `Retry-After`.
- The link routes use the same three rate limits as sign-in, under `link_*` keys (approved
  2026-11-13).
- The unlink transaction writes the owning `users` document first, so two concurrent unlinks
  write-conflict and the loser re-counts. Sign-in always writes the wallet document. Both guard
  writes use a value strictly later than the stored one, because MongoDB skips an update that sets
  a field to its current value, and a skipped update cannot conflict.

## Context

PR 02 of `docs/IMPLEMENTATION_ROADMAP.md` (authentication and wallet abstraction) was split into
02a and 02b. `docs/OPEN_DECISIONS.md` §2 asked for the auth provider, whether email is required and
whether accounts hold multiple wallets. ADR-0005 left Helius mainnet status unconfirmed.

## Rationale

- Wallet signatures are the product's identity primitive. Self-hosting keeps every credential
  decision, log line and stored field under this repository's redaction and review rules.
- Opaque, hashed, server-side sessions can be revoked one by one and leak nothing useful if the
  database is read. A stateless JWT cannot be revoked before it expires.
- `node:crypto` Ed25519 adds no dependency; the raw-key SPKI wrapper was verified against
  RFC 8032 §7.1 on Node 24.

## Alternatives considered

- **Hosted provider (Privy, Dynamic):** rejected (A1): third-party custody of identity and
  session data.
- **Email magic link plus wallet linking:** rejected (A1): adds email storage that the product
  does not need.
- **One wallet = one account; multi-wallet schema with linking deferred:** rejected (A3).
- **Devnet-only allowlist default:** rejected (A4).
- **Wallet Standard `solana:signIn` + `verifySignIn` helper; stateless JWT:** rejected (A5).
- **`@solana/kit` address codec or a hand-written base58 decoder:** rejected (architecture §1.2).

## Evidence / references

- Spec: `docs/specs/2026-11-13-auth-api-design.md`. Architecture:
  `docs/specs/2026-11-13-auth-api-architecture.md` (§7 records the three user decisions).
- Tests: `tests/unit/wallet/*.test.ts` (RFC 8032 vectors, message golden bytes, base58),
  `tests/integration/routes/v1/*.test.ts` (every spec §7 error row, the happy path, sessions,
  wallets, rate limits, logging, persistence), `tests/integration/auth/unlink-race.test.ts`.

## Consequences

- **IP pseudonymization (follow-up).** Rate-limit keys embed the client IP and are stored as unsalted SHA-256, so IPv4 values are recoverable by enumeration until the TTL removes them. Switching to a keyed (HMAC) hash is a tracked follow-up.
- **Mainnet-binding risk (A4).** A `mainnet-beta` wallet can be bound before the Helius privacy
  layer is confirmed for mainnet (ADR-0005). Binding a mainnet wallet never implies privacy
  readiness. Every wallet and session response states its `network`, nothing in the API asserts
  privacy capability, and PR 02b must display the network prominently.
- With `TRUST_PROXY=false` behind a proxy, every client shares one rate-limit bucket. With
  `TRUST_PROXY=true` behind a CDN plus a load balancer, the rightmost `X-Forwarded-For` entry is the
  CDN, so all clients also share one bucket unless the edge overwrites the header. The deploy
  configuration must set `TRUST_PROXY` correctly.
- The per-address challenge limit (20/hour) lets anyone who knows an address delay that address's
  sign-in for up to an hour.
- MongoDB-based rate limiting costs one write per auth request; revisit if load requires.
- `security_events` has no TTL until a retention policy is approved.
- Phantom and Solflare `signMessage` differences are checked manually in PR 02b.

## Scope / privacy / security impact

Client IPs are never stored in plain form. When `TRUST_PROXY=true`, an IP appears only pseudonymized, as part of an unsalted SHA-256 rate-limit key that expires with its window (IP-keyed windows are 1 minute, no window exceeds 1 hour, plus TTL sweep lag). IPv4 values are recoverable from these hashes by enumeration. A keyed (HMAC) hash is a tracked follow-up.

Never stored: private keys, seed phrases, raw session tokens, the nonce as a field, signatures
and email (asserted by `tests/integration/routes/v1/persistence.test.ts`). Logs never
contain the token, its hash, the nonce, the signature or the full message (asserted by
`tests/integration/routes/v1/logging.test.ts`). The specific `AUTH_FAILED` reason goes only to
`security_events.reason` and the redacting logger, never to the response. A comprehensive security
review of PR 02a is deferred to the Security Engineer.
