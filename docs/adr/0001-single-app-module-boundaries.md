# ADR-0001: Single Next.js app with internal module boundaries

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decision D1)

## Decision

GHOST WIRE is one Next.js App Router application. Domain code lives in internal modules under
`src/modules/<name>/`. Each module exposes exactly one public entry (`index.ts`) and keeps its
implementation in a flat `internal/` directory. Four boundary rules are enforced by ESLint:

1. Outside a module, code imports only `@/modules/<name>`; deep imports such as
   `@/modules/<name>/internal/...` are errors.
2. Files under `src/modules/**` never import from `src/app/**`.
3. Only `src/modules/database/**` may import `mongodb` (or `bson`).
4. Only `src/modules/config/**` may read `process.env` (exceptions: Next/tooling config files,
   `src/instrumentation.ts`, and test setup/helpers).

The rules also cover dynamic `import()` and `require()` with a literal specifier, `./`-prefixed
relative escapes, and a catch-all scope, so every `src/**/*.{ts,tsx}` file is covered by some scope.
`src/instrumentation-node.ts` falls under the normal `src` scope and is not an env exception.

Modules created now: `shared`, `validation`, `config`, `database` (implemented) and `privacy`,
`wallet`, `payments`, `blockchain`, `security` (placeholders exporting nothing).

## Context

The repository contained only documentation at the start of this cycle (no package manifest, no
source). `docs/TECHNICAL_ARCHITECTURE.md` asks for a modular monolith with Helius-specific code
behind a privacy adapter. `OPEN_DECISIONS.md` §3 required inspecting the repository before locking
the package architecture.

## Rationale

- One deployable keeps the MVP simple, as the technical architecture requests.
- Public-entry modules give the privacy adapter a hard seam: later PRs can keep every Helius call
  inside `src/modules/privacy` and lint can prove nothing else reaches the SDK.
- Built-in ESLint rules (`no-restricted-imports` with regex patterns, `no-restricted-syntax`,
  `no-restricted-properties`), scoped per file glob, express all four rules without a resolver
  plugin.

## Alternatives considered

- **Bun-workspaces monorepo** (`packages/*`): rejected; it adds build/publish plumbing with
  no MVP benefit.
- **Hybrid with `packages/privacy`**: rejected for now; the module boundary gives the same isolation,
  and extraction stays possible later because the module already has a single public entry.
- **`eslint-plugin-boundaries`**: rejected; it needs an import resolver and settings that are easy to
  misconfigure, and its ESLint 9/10 peer support lags core.

## Evidence / references

- Spec: `docs/specs/2026-11-12-discovery-foundation-design.md` §2 (D1), §4.
- Architecture: `docs/specs/2026-11-12-discovery-foundation-architecture.md` §1.5, §2, §4.
- Enforcement: `eslint.config.mjs` (scopes S1–S12 plus the catch-all); proof: `tests/unit/lint/boundaries.test.ts`.

## Consequences

- A flat-config object that sets the same rule replaces it, so each scope emits exactly one
  composed entry per rule and scopes use disjoint globs. Contributors must extend the scope helper
  instead of adding overlapping rule objects.
- The scopes are an allowlist of paths. A new top-level directory such as `scripts/` or
  `tests/e2e/`, or new extensions such as `.mts` or `.js`, is not covered until it gets its own scope.
- Accepted residual risks, documented in `eslint.config.mjs`, because static linting cannot close
  them: `process` aliasing (`const p = process; p.env`, `globalThis["process"]`, an aliased
  `node:process` import) and template or computed `import()` specifiers.
- Module dependency direction (`shared`/`validation` import nothing; `config` imports `shared`;
  `database` imports `config` and `shared`) is a review convention, not yet lint-enforced.
- Moving a module into a package later is mechanical: its `index.ts` is already the package API.

## Scope / privacy / security impact

- Scope: no product scope change.
- Privacy: positive. The privacy adapter can be lint-isolated in PR 03.
- Security: positive, within the limits of static linting. Lint enforces that direct `process.env` access happens only in `config` and that only `database` imports the driver. `process` aliasing and computed `import()` specifiers are accepted residual risks (see Consequences), so this is a guardrail, not a guarantee.
