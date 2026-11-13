# ADR-0004: Vitest with an in-memory MongoDB replica set for integration tests

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decisions D3 and D4)

## Decision

Vitest 5.1.0 is the test runner with two projects: `unit` (`tests/unit/**`) and `integration`
(`tests/integration/**`). Integration tests use `mongodb-memory-server-core` 11.3.0: a global setup
starts one single-node `MongoMemoryReplSet` pinned to MongoDB 7.0.12 and provides its URI; each test
file gets its own database (`gw_test_<8 hex>`), dropped afterwards. Setting
`MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` uses a local binary instead of downloading one.

## Context

Transactions need a replica set. The test runner should run on the same runtime as the
Next.js server (Node). CI is deferred to the Ship phase.

## Rationale

- Vitest runs on Node, so tests have runtime parity with the server.
- An in-memory replica set needs no Docker and gives real transaction semantics.
- MongoDB 7.0.12 is pinned because the library's default MongoDB 8.x has no build for this host's
  Ubuntu 20.04 and the local `/usr/bin/mongod` is 7.0.12.
- The `-core` package has the same API as `mongodb-memory-server` without a `postinstall` binary
  download (Bun blocks untrusted lifecycle scripts anyway).

## Alternatives considered

- **`bun test`**: rejected; it is not Node and bypasses Vitest.
- **Docker Compose MongoDB**: rejected for this cycle; it adds a daemon dependency for contributors.
- **Both Docker and in-memory**: rejected; two harnesses to maintain.

## Evidence / references

- Architecture §6 (test harness mechanics).
- `vitest.config.ts`, `tests/setup/integration.global.ts`, `tests/setup/integration.setup.ts`,
  `tests/helpers/mongo.ts`.

## Consequences

- On this host, set `MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` before running tests.
- An unrelated developer `mongod` may be listening on localhost:27017; the tests never use that port.
- Outage tests start a dedicated standalone server and stop it; they take about 2 s each, bounded
  by the 2 s server-selection timeout.
- No coverage threshold is set (out of scope); `bun run test:coverage` reports only.
- The production MongoDB server version is undecided (hosting is open); 7.0 is the oldest version
  integration-tested.

## Scope / privacy / security impact

- Scope: none.
- Privacy: none. Tests use synthetic data only.
- Security: neutral. Tests never use real credentials; fixtures with fake credentials exist only to
  prove redaction.
