# ADR-0002: Bun for tooling, Node 24 as the runtime

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decision D6)

## Decision

Bun 1.4.4 is the package manager and script runner (`packageManager: "bun@1.4.4"`, committed
text lockfile `bun.lock`, `bunfig.toml` `[install] exact = true`). Node 24 is the only runtime
(`.nvmrc` = `24`, `engines.node` = `>=24.0.0 <25`). Scripts invoke the `next`, `eslint`, `vitest`
and `tsc` bins, which run on Node through their shebangs. Scripts never use `--bun`.

This supersedes the "Runtime/package manager: Bun" row in `docs/TECHNICAL_ARCHITECTURE.md` §2.

## Context

Next.js, the MongoDB driver and Vitest document and test against Node. The Helius SDK's runtime
support is not yet verified (ADR-0005). Bun's installer is fast and its lockfile is reproducible.

## Rationale

- Runtime parity: what runs in tests and `next build` is what runs in production.
- Reproducibility: exact pins plus a committed lockfile; installs use `bun install --frozen-lockfile`.
- Supply-chain caution for a payments product: each pin is the newest stable release published at
  least 7 days before 2026-11-12 (soak rule). Releases skipped under it: `next`/`eslint-config-next`
  16.4.6, `mongodb` 7.9.0, `vite` 8.3.7/8.3.8, `prettier` 3.10.x.

## Alternatives considered

- **Bun as runtime**: rejected; it is not what Next.js and the driver are validated on, and the
  Helius SDK runtime support is unknown.
- **npm/pnpm**: rejected; Bun was the documented project choice and works as an installer for this stack.
- **Latest versions instead of soak pins**: rejected by default (Conductor default adopted).

## Evidence / references

- Architecture §1 (dependency manifest and compatibility evidence) and §9 (risks).
- Version constraints found: TypeScript pinned to 6.0.3 because `typescript-eslint` 8.72.x
  requires `<6.1.0`; ESLint pinned to 9.39.5 because `eslint-config-next@16.4.5`'s React,
  import and jsx-a11y plugins do not accept ESLint 10; `vite` 8.3.6 installed explicitly as a
  Vitest 5 peer.
- `next lint` no longer exists in Next 16, so `lint` runs `eslint .`. `typecheck` runs
  `next typegen && tsc --noEmit` so route types exist on a fresh clone.

## Observed during implementation

- Blocked lifecycle scripts reported by `bun install` (not trusted): none observed. `bun pm untrusted`
  reports 0 untrusted dependencies with lifecycle scripts, and no "Blocked postinstalls" were seen.
- `next build` rewrote `tsconfig.json`: No.
- Next.js 16.4.6 security status at implementation time: not a security release; 16.4.5 kept under the
  7-day soak rule.
- Invalid config at boot: Next 16.4.5 catches errors thrown from instrumentation `register()` and keeps
  serving. A smoke test with invalid config stayed up until the timeout (exit 124). The fix, decided by
  the project owner: `src/instrumentation.ts` checks `NEXT_RUNTIME === "nodejs"`, skips
  `phase-production-build`, and dynamically imports `failFastOnInvalidConfig()` from
  `src/instrumentation-node.ts`. That function catches `ConfigError`, calls
  `logger.error("invalid configuration, exiting", ...)` and then `process.exit(1)`; any other error is
  rethrown. The code is split across two files because `process.exit` in `instrumentation.ts` caused an
  Edge Runtime build warning. After the fix the smoke test exits 1. This applies to `bun run dev` and
  `bun run start`: a bad `.env` stops the dev server until it is fixed and the server restarted.
- Known issue: Bun installs `node_modules/prettier/bin/prettier.cjs` with mode 0644 (a hardlink from the
  bun cache), so `bun run format` and `bun run format:check` exit 126 "Permission denied" on this host.
  `node node_modules/prettier/bin/prettier.cjs --check .` works. Nothing in `node_modules` is chmod-ed.

## Consequences

- `bun test` runs Bun's own runner and must never be used; `bun run test` runs Vitest (README).
- The local Node is 24.0.2; moving to the current 24.x LTS patch is recommended, not blocking.
- Every pin must be re-checked against the soak rule when upgrading.
- Boot-time fail-fast depends on the `process.exit(1)` workaround in `src/instrumentation-node.ts`; re-check
  it when upgrading Next, since a future version may change how `register()` errors are handled.
- Developers running `bun run dev` with an invalid `.env` get an exit rather than a degraded server.

## Scope / privacy / security impact

- Scope: none.
- Privacy: none.
- Security: positive. Exact pins, a frozen lockfile, untrusted postinstalls blocked, and a soak window.
  The boot error names keys and static reasons only, never values.
