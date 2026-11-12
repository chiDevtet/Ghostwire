# GHOST WIRE — Stage 0 Discovery + PR 01 Foundation: Design Spec

**Date:** 2026-11-12
**Status:** Approved in brainstorming; pending written-spec review
**Roadmap items:** Stage 0 (Repository and documentation discovery), PR 01 (Project foundation)

## 1. Goal

Establish a reproducible, strictly typed application baseline and record the stack decisions as ADRs, so later PRs (auth/wallets, Helius adapter, payments) build on verified, documented foundations.

## 2. Decisions made in brainstorming

| # | Decision | Alternatives rejected |
|---|---|---|
| D1 | Single Next.js (App Router) app with internal module boundaries under `src/modules/*` | Bun-workspaces monorepo; hybrid with `packages/privacy` |
| D2 | Official `mongodb` driver; Zod schemas are the single source of truth for document shapes | Mongoose |
| D3 | Vitest as test runner (Node runtime parity with Next.js server) | `bun test` |
| D4 | Integration tests use `mongodb-memory-server` `MongoMemoryReplSet` (replica set needed for transactions) | Docker Compose; both |
| D5 | Helius discovery is research-only in this cycle, captured in an ADR; no SDK install | Skip Helius until PR 03 |
| D6 | Bun is package manager/script runner; Node 24 is the runtime | — |
| D7 | CI workflow is deferred to the Ship phase | CI in this cycle |

## 3. Scope

### In scope

**Stage 0 — ADRs** in `docs/adr/`, each using the record format from `docs/OPEN_DECISIONS.md` §6 (decision, date, owner/approver, rationale, evidence/reference, consequences, scope/privacy/security impact):

- `0001-single-app-module-boundaries.md` (D1)
- `0002-bun-tooling-node-runtime.md` (D6)
- `0003-mongodb-driver-zod.md` (D2)
- `0004-vitest-memory-replset.md` (D3, D4)
- `0005-helius-sdk-discovery.md` (D5): current package name and version from npm and the official docs (https://www.helius.dev/docs/privacy), supported runtimes and module format (ESM/CJS, Node vs edge), documented API surface, and for each item in `OPEN_DECISIONS.md` §1 whether the docs answer it, with links. Any item the docs do not clearly answer stays open. Nothing is guessed.
- In `docs/OPEN_DECISIONS.md`, tick the resolved technical items (§3: "Inspect repository…", "Confirm MongoDB conventions and whether Mongoose is used") and link each to its ADR. Next.js/Bun/Helius compatibility is ticked only if ADR-0005 evidence supports it; otherwise it is annotated as partially answered.

**PR 01 — Foundation:**

- Next.js App Router project with TypeScript `strict` (plus `noUncheckedIndexedAccess`), ESLint with boundary rules, and Prettier.
- A module skeleton under `src/modules/*`, each module with a public `index.ts`.
- `config` module: Zod environment schema and a fail-fast `loadConfig()`; a committed `.env.example` with no secrets.
- `database` module: connection, `ping`, `withTransaction`, `ensureIndexes`, and a typed collection helper.
- `shared` module: `AppError` hierarchy, `Result` helpers, a redacting structured logger, and a route error-mapping helper.
- `validation` module: `baseUnits` and id helpers.
- `GET /api/health` and `GET /api/ready`.
- Scripts: `lint`, `typecheck`, `test`, `test:coverage`, `build`, `dev`, `format`.
- Updated README "Development setup" section.

### Out of scope

Auth, sessions and wallets; installing or calling the Helius SDK; the asset registry; payment logic; UI beyond a placeholder landing page; choosing hosting, monitoring or KMS; the CI workflow (Ship phase); a coverage threshold.

## 4. Structure

```text
src/
  app/
    layout.tsx, page.tsx            # placeholder landing ("GHOST WIRE")
    api/health/route.ts             # liveness
    api/ready/route.ts              # readiness
  modules/
    shared/      index.ts (+ internal/)
    validation/  index.ts (+ internal/)
    config/      index.ts (+ internal/)
    database/    index.ts (+ internal/)
    privacy/ wallet/ payments/ blockchain/ security/
                 index.ts           # placeholders: `export {};`
tests/
  unit/
  integration/                      # global setup starts MongoMemoryReplSet
  fixtures/lint/                    # boundary-violation fixture
docs/adr/0001…0005-*.md
.env.example
```

### Boundary rules (ESLint-enforced)

1. Outside a module, code imports only that module's public entry `@/modules/<name>`. Deep imports such as `@/modules/<name>/internal/...` are errors.
2. Files under `src/modules/**` never import from `src/app/**`.
3. Only `src/modules/database/**` may import `mongodb`.
4. Only `src/modules/config/**` may read `process.env`. The exceptions are Next/tooling config files and test setup.

## 5. Components and interfaces

### `config`

- Schema keys: `NODE_ENV` (`development|test|production`), `MONGODB_URI` (required URL string), `MONGODB_DB_NAME` (required, non-empty), `LOG_LEVEL` (`debug|info|warn|error`, default `info`).
- `loadConfig(env = process.env): AppConfig` parses once and memoizes. Tests can reset it with `resetConfigForTests()`.
- On failure it throws `ConfigError`, whose message lists the invalid key names and reasons. It never includes values.

### `database`

- `getDb(): Promise<Db>` uses a single cached `MongoClient` built from config.
- `ping(timeoutMs = 2000): Promise<void>` throws `DependencyUnavailableError` on failure or timeout.
- `withTransaction<T>(fn: (session) => Promise<T>, { maxAttempts = 3 }): Promise<T>` retries only when the error carries the driver labels `TransientTransactionError` or `UnknownTransactionCommitResult`. All other errors propagate immediately, with the session aborted.
- `registerIndexes(collection, specs)` and `ensureIndexes()` create every registered index. Running `ensureIndexes()` twice is safe.
- `typedCollection<S extends ZodType>(name, schema)` wraps inserts (validated with `schema.parse`) and finds (parsed on read).
- `closeDb()` is for tests and shutdown.

### `shared`

- `AppError { code: string; httpStatus: number; safeMessage: string; cause?: unknown }`, with subclasses `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409), `DependencyUnavailableError` (503), `InternalError` (500) and `ConfigError` (startup only).
- `Result<T, E>`, with `ok`, `err` and `isOk`.
- `logger.{debug,info,warn,error}(msg, fields?)` writes JSON lines and honours `LOG_LEVEL`. Redaction is recursive and case-insensitive on key names containing any of: `key`, `seed`, `secret`, `token`, `password`, `mnemonic`, `viewingkey`, `privatekey`, `signature`, `authorization`, `cookie`. Redacted values become `"[REDACTED]"`. Over-redaction (for example `idempotencyKey`) is intentional, because it is the safe failure. Later PRs may add an explicit allowlist for public values such as transaction signatures.
- `toErrorResponse(err): Response`: an `AppError` produces `{code, message: safeMessage}` with its status; any other error produces `500 {code:"INTERNAL", message:"Internal error"}`. The full error is logged through `logger.error`. Stack traces never appear in a response.

### `validation`

- `baseUnits`: a Zod schema that accepts a `bigint` or a string matching `^(0|[1-9][0-9]*)$` and outputs a `bigint`. It rejects JS `number`, decimals, negatives, exponents, whitespace and leading zeros.
- `objectIdString`: a 24-hex string.

### Routes

- `GET /api/health` → `200 {"status":"ok"}`. It has no dependency checks and runs on the Node runtime.
- `GET /api/ready` → it calls `ping()`. Success returns `200 {"status":"ready","checks":{"database":"up"}}`. Failure returns `503 {"status":"unavailable","checks":{"database":"down"}}`, and the cause is logged server-side only.
- Both routes set `export const dynamic = "force-dynamic"` and `Cache-Control: no-store`.

## 6. Error-handling principles

- Fail fast on invalid config, and never echo values.
- Clients only ever see safe messages and stable codes.
- Retries are bounded and limited to errors the driver labels as transient. This sets up the idempotency stance for later payment code.
- Health (liveness) is independent of dependencies, and readiness reflects them.

## 7. Testing

Vitest, written test-first (RED-GREEN-REFACTOR).

- **Unit:**
  - `loadConfig`: valid input passes; for each invalid key, the error lists the key and never the value.
  - `baseUnits`: accepts `"0"`, `"18446744073709551616"` and `5n`; rejects `1.5`, `"1.5"`, `"-1"`, `"1e3"`, `" 1"`, `"01"` and the JS number `1`.
  - Logger redaction: nested objects, arrays, mixed-case keys, and keys like `viewingKey` and `apiKey`.
  - `toErrorResponse` mapping for every subclass and for unknown errors.
- **Integration (`MongoMemoryReplSet`, using the system `mongod` binary when available via `MONGOMS_SYSTEM_BINARY`):**
  - `ping` succeeds; `ping` against a stopped server throws `DependencyUnavailableError`.
  - `withTransaction` commits, rolls back on throw, retries a simulated transient-labelled error, and does not retry other errors.
  - `ensureIndexes` is idempotent.
  - `typedCollection` rejects invalid documents on insert.
  - `/api/ready` returns 200 when the DB is up and 503 when it is down; `/api/health` always returns 200.
- **Boundary:** ESLint run programmatically on `tests/fixtures/lint/` reports the deep-import, `mongodb`-outside-database and `process.env`-outside-config violations.

## 8. Acceptance criteria

1. A fresh clone runs `bun install && bun run lint && bun run typecheck && bun run test && bun run build` with every step passing.
2. ADRs 0001–0005 exist in the §6 format, and `OPEN_DECISIONS.md` is updated and linked as described in §3.
3. No secrets are committed. `.env.example` documents every config key.
4. The README documents setup, scripts and the module boundary rules.
5. The roadmap PR 01 acceptance criteria are met (reproducible setup, build/lint/tests pass, no secrets, environment documented).

## 9. Risks

- **Helius SDK incompatibility** (for example, ESM-only, edge-only, or a Node version floor). ADR-0005 surfaces this before PR 03. The foundation stays runtime-neutral apart from pinning Node 24.
- **Next.js on Node 24 with a Bun lockfile.** It is validated by the acceptance build. If something fails, it is recorded in ADR-0002.
