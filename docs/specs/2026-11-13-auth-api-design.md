# GHOST WIRE — PR 02a Auth API: Design Spec

**Date:** 2026-11-13
**Status:** Approved in brainstorming; pending written-spec review
**Roadmap item:** PR 02 (Authentication and wallet abstraction), split into 02a (this spec: backend auth API) and 02b (designed connect experience, separate spec)
**Builds on:** PR 01 foundation (`docs/specs/2026-11-12-discovery-foundation-design.md`, ADRs 0001–0005)

## 1. Goal

Let a user prove ownership of a Solana wallet with a signed challenge, get a revocable server-side session, and manage the wallets linked to the account. All of this happens over a small authenticated API that 02b's UI will consume. This PR also closes the PR 02 entry gates that the PR #1 final review recorded.

## 2. Decisions made in brainstorming

| # | Decision | Alternatives rejected |
|---|---|---|
| A1 | Wallet-signature auth only, self-hosted. No email, password or third-party auth vendor | Hosted provider (Privy/Dynamic); email magic link + wallet linking |
| A2 | Split PR 02 into 02a (auth API, this spec) and 02b (designed UI). 02b builds the full branded connect UI per `FRONTEND_DESIGN.md` | One combined cycle; backend only; minimal unbranded connect page |
| A3 | One account, many wallets. The first sign-in creates the account, a signed-in user can link more wallets, any linked wallet signs in to the same account, `(address, network)` belongs to exactly one account, and unlinking the last wallet is refused | One wallet = one account; multi-wallet schema with linking deferred |
| A4 | Both `devnet` and `mainnet-beta` are accepted from the start, through a configurable allowlist | Devnet-only allowlist default; hard-coded devnet |
| A5 | The server builds a Sign-In-With-Solana (CAIP-122 layout) message and verifies it with `node:crypto` Ed25519. Sessions are opaque random tokens stored only as SHA-256 hashes | Wallet Standard `solana:signIn` + `verifySignIn` helper; stateless JWT |

**Network risk acknowledged (A4).** Helius mainnet status is unconfirmed (ADR-0005), so binding a mainnet wallet must never imply privacy readiness. Every wallet and session response states its `network` explicitly. No field, code or message in this API asserts privacy capability. 02b must display the network prominently.

## 3. Scope

### 3.1 Entry gates (done first; each with regression tests)

1. **Redaction key names.** Add these substrings to the sensitive-key list in `src/modules/shared/internal/redact.ts`: `passwd`, `pwd`, `passphrase`, `credential`, `bearer`, `jwt`, `session`, `csrf`, `nonce`. (`cookie` is already present. `auth` is deliberately excluded because it would also match `author`.)
2. **Free-text credential scrubbing.** `scrubString` additionally redacts:
   - `Authorization`-style values: `Bearer <token>` and `Basic <token>` become `Bearer [REDACTED]` / `Basic [REDACTED]`, case-insensitive.
   - Query or form parameter values for the names `token`, `access_token`, `api-key`, `api_key`, `apikey`, `secret`, `password`, `session`, `nonce` and `signature`. `name=value` becomes `name=[REDACTED]`, ending at `&`, whitespace, a quote or end of string.

   This is still best-effort. The documented residual risks remain and are extended in the code comment.
3. **Filter operator guard.** A new public helper, `safeEquals(field, value)` in `database`, builds a filter `{ [field]: value }` only when `value` is a string, number, boolean, `bigint`, `ObjectId` or `Date`. Any other value, including an object, array or `$`-keyed value, throws `ValidationError("FILTER_INVALID")`. The `typedCollection` JSDoc states that filters must never be built from request data except through `safeEquals`. Every query in this PR uses it.
4. **Query time limit.** `typedCollection.find` and `findOne` pass `maxTimeMS: 5000`.
5. **5xx code collapsing.** `toErrorResponse` returns `{ code: "INTERNAL", message: "Internal error" }` for every status ≥ 500 except `DEPENDENCY_UNAVAILABLE`, which keeps its 503 code and `Retry-After`. The original code is logged.
6. **Bigint JSON.** `noStoreJson` serializes `bigint` values as decimal strings, using a `JSON.stringify` replacer.

### 3.2 New and filled modules

- **`wallet`** (fills the placeholder):
  - `parseSolanaAddress(s)`: base58 that decodes to exactly 32 bytes.
  - `parseSignature(s)`: base58 that decodes to exactly 64 bytes.
  - `verifyEd25519(publicKey32, message, signature64)`: `node:crypto` with a raw-key SPKI wrapper. It returns a boolean and never throws on a bad signature.
  - `buildSignInMessage(fields)` and `parseSignInMessage(text)`.
  - Wallet repository: find by `(address, network)`, list by user, insert, set status.
- **`security`** (fills the placeholder):
  - `randomToken(bytes)`: base64url from `crypto.randomBytes`.
  - `sha256Hex(s)`.
  - `checkOrigin(request, appOrigin)`.
  - `rateLimit(key, limit, windowSeconds)`: fixed windows in MongoDB. It throws `RateLimitedError` (429) with `retryAfterSeconds`.
  - `clientIp(request, trustProxy)`.
  - `recordSecurityEvent(event)`.
- **`auth`** (new module):
  - `issueChallenge`, `verifySignIn`, `issueLinkChallenge`, `verifyLink`, `unlinkWallet`.
  - Sessions: `createSession`, `resolveSession`, `listSessions`, `revokeSession`.
  - `withSession(handler)` and `withOrigin(handler)` route wrappers.
- **Shared errors.** Add `UnauthenticatedError` (401, `UNAUTHENTICATED`), `AuthFailedError` (401, `AUTH_FAILED`), `ForbiddenOriginError` (403, `ORIGIN_REJECTED`) and `RateLimitedError` (429, `RATE_LIMITED`, which carries `retryAfterSeconds`; `toErrorResponse` sets `Retry-After`).
- **Boundary rules.** `auth` is added to the ESLint module scopes and depends only on `wallet`, `security`, `database`, `config` and `shared`. Nothing in `src/modules` imports `src/app`.

### 3.3 API (under `src/app/api/v1/`)

Every response uses `noStoreJson`. Every non-GET request must pass the Origin check. "Session" means a request carrying a valid session cookie.

| Method & path | Auth | Request body | Success response |
|---|---|---|---|
| `POST /auth/challenge` | none | `{ address, network }` | 200 `{ challengeId, message, expiresAt }` |
| `POST /auth/verify` | none | `{ challengeId, signature }` | 200 `{ user: { id }, wallet: { id, address, network } }` + `Set-Cookie` |
| `POST /auth/logout` | session | none | 204, clears the cookie, revokes the current session |
| `GET /me` | session | — | 200 `{ user: { id, createdAt }, session: { id, network, expiresAt }, wallets: [...] }` |
| `GET /sessions` | session | — | 200 `{ sessions: [{ id, current, createdAt, lastSeenAt, expiresAt, userAgent }] }` |
| `DELETE /sessions/:id` | session | none | 204. Only the caller's own sessions; otherwise 404 |
| `GET /wallets` | session | — | 200 `{ wallets: [{ id, address, network, provider, status, linkedAt }] }` |
| `POST /wallets/link/challenge` | session | `{ address, network }` | 200 `{ challengeId, message, expiresAt }` |
| `POST /wallets/link/verify` | session | `{ challengeId, signature, provider? }` | 201 `{ wallet }` |
| `DELETE /wallets/:id` | session | none | 204. Refused with 409 `LAST_WALLET` if it is the account's only active wallet; 404 if not owned |

`POST /auth/verify` also accepts an optional `provider` label (≤ 32 chars, `[a-z0-9_-]`). It is informational only and never trusted for behaviour.

### 3.4 Out of scope

Any UI (02b); embedded wallets; privacy initialization or any Helius call; email or notifications; payments; CI (separate Ship work); account deletion; admin tooling; IP storage.

## 4. Data model

All collections are declared with Zod schemas through `typedCollection`. Indexes are registered with `registerIndexes` and created by `ensureIndexes`. Ids are ObjectIds and are exposed as 24-hex strings.

| Collection | Fields | Indexes |
|---|---|---|
| `users` | `status` (`active`\|`suspended`\|`deleted`), `createdAt`, `updatedAt` | — |
| `wallets` | `userId`, `address`, `network` (`devnet`\|`mainnet-beta`), `walletType` (`external`), `provider` (nullable), `status` (`active`\|`disconnected`), `linkedAt`, `updatedAt` | unique `(address, network)`; `userId` |
| `auth_challenges` | `nonceHash`, `message`, `address`, `network`, `purpose` (`signin`\|`link`), `userId` (nullable; required for `link`), `createdAt`, `expiresAt`, `consumedAt` (nullable) | unique `nonceHash`; TTL on `expiresAt` (+3600 s) |
| `sessions` | `tokenHash`, `userId`, `walletId`, `network`, `createdAt`, `lastSeenAt`, `expiresAt`, `absoluteExpiresAt`, `revokedAt` (nullable), `userAgent` (≤128 chars, nullable) | unique `tokenHash`; `userId`; TTL on `absoluteExpiresAt` |
| `rate_limits` | `key` (SHA-256 of `route:subject`), `windowStart`, `count`, `expiresAt` | unique `(key, windowStart)`; TTL on `expiresAt` |
| `security_events` | `type`, `severity` (`info`\|`warning`\|`critical`), `userId` (nullable), `walletId` (nullable), `reason` (static string, nullable), `createdAt` | `(userId, createdAt)`; no TTL until a retention policy is approved |

The `security_events.type` values are `signin_success`, `signin_failed`, `wallet_linked`, `link_failed`, `wallet_unlinked`, `session_revoked` and `rate_limited`.

Never stored: private keys, seed phrases, raw session tokens, raw nonces, IP addresses or email.

## 5. Flows

### 5.1 Sign-in message (exact format, UTF-8, `\n` line endings)

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

- `domain` is the host of `APP_ORIGIN` and `origin` is `APP_ORIGIN`.
- `nonce` is 16 random bytes as base64url.
- Both timestamps are ISO-8601 UTC with milliseconds. Expiry is 5 minutes after issue.
- Link challenges use the statement `Link this wallet to your GHOST WIRE account. This does not authorize any transaction or move funds.`

### 5.2 Sign-in

1. **Challenge.**
   - Validate the address and that the network is in `SOLANA_NETWORKS`.
   - Rate-limit by IP (10/min) and by address (20/hour).
   - Build the message and store the challenge (`nonceHash = sha256(nonce)`, full message, address, network, `purpose: "signin"`).
   - Return the id, message and expiry.
2. **Verify.**
   - Rate-limit by IP (10/min).
   - Consume the challenge atomically: one `findOneAndUpdate({ _id, purpose: "signin", consumedAt: null, expiresAt: { $gt: now } }, { $set: { consumedAt: now } })`. No match gives `AUTH_FAILED`.
   - Verify the signature over the stored message bytes against the stored address's public key. A failure gives `AUTH_FAILED`. The challenge stays consumed, so a single signature attempt is all one challenge allows.
   - In one `withTransaction`: find the wallet by `(address, network)`. If none exists, create a user and an active wallet. If it exists and its user is not `active`, the result is `AUTH_FAILED`. If the wallet is `disconnected`, reactivate it.
   - Create a session and set the cookie.
   - Record `signin_success`, or `signin_failed` with a static reason.

### 5.3 Link and unlink

- **Link.** The challenge and verify steps match sign-in, with `purpose: "link"` and `userId` set to the session user. Verify must match `userId` as well.
  - If the wallet exists under another user, the result is 409 `WALLET_ALREADY_LINKED`.
  - If it exists under the same user and is disconnected, it is reactivated.
  - If it exists under the same user and is active, the existing wallet is returned with 200.
  - A new link returns 201.
- **Unlink.** It sets `status: "disconnected"`, and is refused with `LAST_WALLET` when it would leave zero active wallets. Two concurrent unlinks cannot both pass the last-wallet rule. Snapshot isolation alone would allow write skew, so the unlink transaction also writes the owning `users` document (`updatedAt`). Concurrent unlinks for one user therefore conflict on that write. The losing transaction is retried by `withTransaction` and then sees the updated count. Unlinking a wallet also revokes the sessions that were created with it. Disconnecting never affects onchain assets.

### 5.4 Sessions

- **Token.** The token is 32 random bytes as base64url. Only `sha256(token)` is stored.
- **Cookie.**
  - Production: `__Host-gw_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<idle seconds>`.
  - When `APP_ORIGIN` is `http://` (local dev): `gw_session` with the same attributes minus `Secure` and the `__Host-` prefix.
- **Resolve.**
  - Hash the cookie value and look the session up through `safeEquals("tokenHash", …)`.
  - The session is rejected if it is revoked, past `expiresAt` or `absoluteExpiresAt`, or its user is not active.
  - On success, slide `expiresAt` to `now + SESSION_IDLE_DAYS`, capped at `absoluteExpiresAt`. `lastSeenAt` and `expiresAt` are written at most once per hour per session.
- **Lifetimes.** The defaults are `SESSION_IDLE_DAYS=7` and `SESSION_MAX_DAYS=30`.
- **Logout and revoke.** Both set `revokedAt`. Logout also clears the cookie with `Max-Age=0`.

### 5.5 Request protection

- **Origin check.** Every non-GET request under `/api/v1` must have an `Origin` header exactly equal to `APP_ORIGIN`. A missing or different Origin gives 403 `ORIGIN_REJECTED`. `SameSite=Lax` is defence in depth.
- **Client IP.** The IP is the first `x-forwarded-for` entry only when `TRUST_PROXY=true`. Otherwise it is the literal `"unknown"`, which means a single shared IP bucket. That fails safe toward stricter limits.
- **Rate limits.** The defaults are in §5.2. They can be overridden through the config keys `RATE_LIMIT_CHALLENGE_PER_MIN`, `RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS` and `RATE_LIMIT_VERIFY_PER_MIN`.
- **Body size.** JSON bodies over 4 KB are rejected with 400 `VALIDATION_FAILED`.

## 6. Configuration additions

| Key | Rule | Default |
|---|---|---|
| `APP_ORIGIN` | Required. An `https://` or `http://` origin with no path | — |
| `SOLANA_NETWORKS` | Comma list ⊆ {`devnet`, `mainnet-beta`}, non-empty | `devnet,mainnet-beta` |
| `TRUST_PROXY` | `true`\|`false` | `false` |
| `SESSION_IDLE_DAYS` | Integer 1–30 | `7` |
| `SESSION_MAX_DAYS` | Integer, at least `SESSION_IDLE_DAYS`, at most 90 | `30` |
| `RATE_LIMIT_CHALLENGE_PER_MIN` | Integer 1–1000 | `10` |
| `RATE_LIMIT_CHALLENGE_PER_HOUR_ADDRESS` | Integer 1–1000 | `20` |
| `RATE_LIMIT_VERIFY_PER_MIN` | Integer 1–1000 | `10` |

`.env.example` and the README config table are updated to match. Messages for invalid config still name keys only.

## 7. Error contract

| Situation | HTTP | `code` |
|---|---|---|
| Malformed body, address, signature or provider; body too large | 400 | `VALIDATION_FAILED` |
| Network not in the allowlist | 400 | `NETWORK_UNSUPPORTED` |
| Challenge unknown, expired, consumed or wrong purpose/user; bad signature; inactive user | 401 | `AUTH_FAILED` |
| Missing, invalid, revoked or expired session | 401 | `UNAUTHENTICATED` |
| Missing or mismatched Origin on a non-GET request | 403 | `ORIGIN_REJECTED` |
| Session or wallet not owned by the caller, or nonexistent | 404 | `NOT_FOUND` |
| Wallet linked to another account | 409 | `WALLET_ALREADY_LINKED` |
| Unlinking the last active wallet | 409 | `LAST_WALLET` |
| Rate limit exceeded | 429 | `RATE_LIMITED` (+ `Retry-After`) |
| Database unavailable | 503 | `DEPENDENCY_UNAVAILABLE` |
| Anything else | 500 | `INTERNAL` |

The specific reason behind an `AUTH_FAILED` goes only to `security_events.reason` (static strings) and the redacting logger. It never goes in the response.

## 8. Testing

Vitest, written test-first.

- **Unit tests:**
  - Message build and parse round-trip. The parser rejects any altered field, an extra line, a wrong statement or a CRLF line ending.
  - base58 parsing: valid input; wrong length; non-alphabet characters (`0`, `O`, `I`, `l`); empty input.
  - `verifyEd25519` against RFC 8032 §7.1 test vectors 1–3, and against fresh `crypto.generateKeyPairSync("ed25519")` keypairs (sign → verify true; flip one bit of the message or signature → false; wrong key → false).
  - Token and hash helpers, `checkOrigin`, `clientIp` and rate-limit window maths.
  - Each entry gate: the new redaction keys, `Bearer`/`Basic` and query-parameter scrubbing, `safeEquals` rejecting operator objects and arrays, `maxTimeMS` being passed, 5xx collapsing (with `DEPENDENCY_UNAVAILABLE` preserved) and bigint serialization.
- **Integration tests:** `MongoMemoryReplSet`, route handlers called directly with `Request` objects, and Ed25519 keypairs generated in the test.
  - **Happy path:** challenge → verify → cookie → `/me` → `/sessions` → logout → `/me` returns 401.
  - **Sign-in failures:**
    - replaying a consumed challenge
    - an expired challenge (fake timers)
    - a signature from another key
    - a signature over a tampered message
    - a wrong network
    - a disallowed network (config without `mainnet-beta`)
    - two concurrent verifies of one challenge, where exactly one succeeds
  - **Sessions:** idle expiry; absolute expiry; revocation; another user's session id returns 404; the cookie attributes are correct for https and for http `APP_ORIGIN`.
  - **Origin check:** a non-GET request with no Origin, a foreign Origin, or a matching Origin gives 403, 403 and success respectively.
  - **Rate limits:** the (limit+1)th challenge returns 429 with `Retry-After`.
  - **Wallets:**
    - link a second wallet, then sign in with it to reach the same user
    - link a wallet owned by another user gives 409
    - unlink the last wallet gives 409
    - concurrent unlinks of the last two wallets leave exactly one active
    - unlinking revokes that wallet's sessions
    - another user's wallet id gives 404
  - **Logging:** across the full happy path and failure paths, captured log lines contain none of the raw session token, the nonce, the signature or the full message.

## 9. Acceptance criteria

1. Every endpoint in §3.3 behaves as specified, and every row of §7 is covered by at least one test.
2. All entry gates in §3.1 are implemented, each with a regression test.
3. No raw token, nonce, signature, IP or email is persisted. A test asserts this on the stored documents after the happy path.
4. `bun run lint`, `bun run typecheck`, `bun run test` and `bun run build` pass on a fresh clone with no `.env`. This keeps the PR 01 guarantee: `APP_ORIGIN` is required only at runtime and at boot, and the test harness supplies its own value.
5. A new ADR-0006 records the auth design (A1–A5), the message format, the session model, and the mainnet-binding risk from A4. README and `.env.example` document the new config keys.

## 10. Risks

- **Mainnet binding before the privacy layer is confirmed (A4).** This is mitigated by explicit `network` fields, no capability claims, and 02b's display requirement.
- **The single shared rate-limit bucket when `TRUST_PROXY=false` behind a proxy** may throttle all users together. This is documented. The deploy configuration must set `TRUST_PROXY` correctly.
- **Wallet `signMessage` differences between Phantom and Solflare** are not exercised here (no UI). 02b's manual compatibility check covers them, and the message is plain UTF-8 to keep wallet display predictable.
- **MongoDB-based rate limiting** adds one database write per auth request. That is acceptable at beta scale and revisited if load requires.
