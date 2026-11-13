# ADR-0003: Official MongoDB driver with Zod schemas as the source of truth

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decision D2)

## Decision

Use the official `mongodb` driver (7.8.0), with no ODM. Zod (4.6.7) schemas are the single source of
truth for document shapes, excluding `_id`. All database access goes through `@/modules/database`:

- `getDb()` / `closeDb()`: one cached `MongoClient` with bounded timeouts (server selection 2 s,
  connect 2 s, socket 30 s, pool max 10).
- `ping(timeoutMs = 2000)`: timer-raced; failures become `DependencyUnavailableError`.
- `withTransaction(fn, { maxAttempts = 3 })`: a hand-rolled loop. It retries only errors labelled
  `TransientTransactionError` (re-running `fn`) or `UnknownTransactionCommitResult` (retrying the
  commit only, never `fn`). All other errors propagate unchanged after an abort.
- `registerIndexes()` / `ensureIndexes()`: explicit index names; re-running is a server no-op.
- `typedCollection(name, schema)`: inserts store the parsed output; reads are parsed and
  drift is reported as `DATA_INTEGRITY`; `find` requires `limit` ≤ 1000.

## Context

There was no existing MongoDB convention and no Mongoose in the repository (`OPEN_DECISIONS.md` §3).
Payment code later needs correct transactions and idempotency. `docs/DATA_MODEL.md` specifies
snake_case collections and string amounts at persistence boundaries.

## Rationale

- One schema language (Zod) for config, request validation and documents avoids drift.
- The driver's `session.withTransaction` retries for up to 120 s with no count bound; a bounded,
  label-driven loop matches the "bounded retries" principle and keeps `fn` free of side effects.
- Mapping driver errors to `AppError`s (keeping the driver error as `cause`) gives routes stable
  codes and safe messages.

## Alternatives considered

- **Mongoose**: rejected; it duplicates Zod's role and its middleware hides writes.
- **Driver `session.withTransaction`**: rejected for the unbounded retry window.

## Evidence / references

- Spec §5 (`database`), §6; Architecture §3.4, §5.
- Tests: `tests/integration/database/*.test.ts` (ping, transactions incl. simulated labels,
  index idempotency, typed collections).

## Consequences

- No collections are created by application code yet. The `ensureIndexes()` call site (a
  `db:indexes` script or a boot hook) is chosen in the first PR that adds a collection.
- The persistence encoding for `bigint` amounts (decimal string, `Long` or `Decimal128`) is decided
  in the payments PR, with the Data Engineer.
- `fn` passed to `withTransaction` may run up to `maxAttempts` times: no HTTP calls, chain submissions
  or emails inside it.
- For duplicate-key errors (code 11000), `mapMongoError` attaches a sanitized cause,
  `Error("duplicate key")` with `code: 11000`, instead of the raw driver error. The raw error echoes the
  duplicated value, and log redaction does not scrub values inside free text. Other `MongoServerError`s
  still pass through raw as `cause`.

## Scope / privacy / security impact

- Scope: none.
- Privacy: neutral. No personal data is stored by this PR. The sanitized duplicate-key cause keeps
  user-supplied values out of logs.
- Security: positive. Credentials in URIs are scrubbed from logs, and the driver's parse errors
  (which can echo the URI) are not surfaced.
