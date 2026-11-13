# GHOST WIRE Stage 0 + PR 01 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible, strictly typed Next.js App Router baseline: `shared`, `validation`, `config` and `database` modules, `/api/health` and `/api/ready`, and ESLint-enforced module boundaries. Record the stack decisions as ADRs 0001–0005.

**Architecture:** A single Next.js 16 app. Its internal modules live under `src/modules/<name>/`. Each module has a public `index.ts` and a flat `internal/` directory, and ESLint rules (built-in `no-restricted-*` rules, scoped by file glob) enforce the boundaries. MongoDB is reached only through the `database` module, which uses the official driver. Zod schemas are the source of truth for both configuration and document shapes. Failures are mapped to a small `AppError` hierarchy that carries safe client messages. Retries are bounded and fire only on driver-labelled transient errors.

**Tech Stack:** Next.js 16.4.5, React 19.3.1, TypeScript 6.0.3, Zod 4.6.7, mongodb driver 7.8.0, Vitest 5.1.0 with Vite 8.3.6, mongodb-memory-server-core 11.3.0 (MongoDB 7.0.12), ESLint 9.39.5 with eslint-config-next 16.4.5, and Prettier 3.9.10. Bun 1.4.4 is the package manager and script runner. Node 24 is the runtime.

**Source documents (read before starting any task):**
- Spec: `docs/specs/2026-11-12-discovery-foundation-design.md`
- Architecture: `docs/specs/2026-11-12-discovery-foundation-architecture.md`. It has the exact pins, the directory tree, the signatures, the ESLint design, the failure strategy and the test harness.

## Global Constraints

- Runtime: Node 24. `.nvmrc` is `24` and `engines.node` is `">=24.0.0 <25"`. Bun `1.4.4` (`packageManager: "bun@1.4.4"`) is only the package manager and script runner.
- Never run `bun test`, which starts Bun's built-in runner instead of Vitest. Always use `bun run test`. Never add `--bun` to scripts.
- Every direct dependency is pinned exactly, with no `^` or `~` (`bunfig.toml` `[install] exact = true`). `bun.lock` is committed.
- Pins: `next 16.4.5`, `react 19.3.1`, `react-dom 19.3.1`, `mongodb 7.8.0`, `zod 4.6.7`, `typescript 6.0.3`, `@types/node 24.19.2`, `@types/react 19.3.0`, `@types/react-dom 19.3.0`, `eslint 9.39.5`, `eslint-config-next 16.4.5`, `eslint-config-prettier 10.1.8`, `prettier 3.9.10`, `vitest 5.1.0`, `@vitest/coverage-v8 5.1.0`, `vite 8.3.6`, `mongodb-memory-server-core 11.3.0`.
- Do not add these packages: `helius-sdk`, `mongoose`, `server-only`, `dotenv`, `eslint-plugin-boundaries`, `vite-tsconfig-paths`, `@vitejs/plugin-react`, or direct `@eslint/js` / `typescript-eslint`.
- TypeScript runs with `strict` plus `noUncheckedIndexedAccess`. `target` is `ES2022`, and it must be at least ES2020 because the code uses bigint literals.
- Boundary rule 1: outside a module, code imports only that module's public entry `@/modules/<name>`. Deep imports such as `@/modules/<name>/internal/...` are errors.
- Boundary rule 2: files under `src/modules/**` never import from `src/app/**`.
- Boundary rule 3: only `src/modules/database/**` may import `mongodb`.
- Boundary rule 4: only `src/modules/config/**` may read `process.env`. The exceptions are Next/tooling config files, `src/instrumentation.ts` and test setup or helpers.
- Within a module, imports are relative (`./x`). Across modules, imports use `@/modules/<name>` only. `internal/` is flat.
- Nothing runs I/O or `loadConfig()` at module top level. Without this, `next build` on a fresh clone with no `.env` breaks.
- No `console.*` in `src/`. All logging goes through `logger` from `@/modules/shared`, which redacts.
- Redaction is recursive and case-insensitive. Values whose key name contains any of `key`, `seed`, `secret`, `token`, `password`, `mnemonic`, `viewingkey`, `privatekey`, `signature`, `authorization`, `cookie` become `"[REDACTED]"`. In strings, `scheme://user:pass@` becomes `scheme://[REDACTED]@`.
- Clients only see `{ code, message: safeMessage }`. A response never contains a stack trace, a `cause` or a driver message.
- `ConfigError` messages list key names and static reasons only. They never include values.
- Retries are bounded. They fire only when an error carries a driver label (`TransientTransactionError` or `UnknownTransactionCommitResult`). `withTransaction` defaults to `maxAttempts = 3`, an integer in [1, 10].
- `ping()` defaults to a 2000 ms timeout. Every MongoClient timeout follows architecture §5.2.
- Do not use `next/font/google`. Do not enable `cacheComponents`. Both routes export `runtime = "nodejs"` and `dynamic = "force-dynamic"` and send `Cache-Control: no-store`.
- Integration tests use `MongoMemoryReplSet` pinned to MongoDB `7.0.12`. On this host, `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` before running tests.
- Collection names match `/^[a-z][a-z0-9_]{0,62}$/`. Index names are explicit and match `/^[A-Za-z0-9_]{1,64}$/`.
- Helius: never invent package names, versions, method names, URLs or capabilities. If the docs do not clearly answer an item, it stays open.
- Never commit secrets, seed phrases, private keys or real credentials. `.env.example` documents every config key and contains no secrets.
- Lint, typecheck and tests pass at the end of every task. A base ESLint config lands in Task 1, and the boundary rules land in Task 11.
- `git add` only the files a task lists. Never `git add -A`, because `.agenkit/`, `.claude/`, `AGENTS.md` and `agenkit.lock.json` are untracked and are not this plan's to commit.
- Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The second `-m` in each commit command produces this.

---

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `package.json`, `bun.lock`, `bunfig.toml`, `.nvmrc` | Exact pins, scripts, Node 24 pin | 1 |
| `tsconfig.json`, `next.config.ts` | Strict TS, `@/*` alias, Next options | 1 |
| `.gitignore`, `.prettierrc`, `.prettierignore` | Hygiene and formatting | 1 |
| `eslint.config.mjs` | Base Next + Prettier lint (Task 1); boundary scopes added (Task 11) | 1, 11 |
| `vitest.config.ts` | `unit` project (Task 1); `integration` project added (Task 7) | 1, 7 |
| `src/app/layout.tsx`, `src/app/page.tsx` | Static "GHOST WIRE" placeholder | 1 |
| `src/modules/shared/internal/errors.ts` | `AppError` hierarchy, `ConfigError`, `isAppError` | 2 |
| `src/modules/shared/internal/result.ts` | `Result`, `ok`, `err`, `isOk` | 2 |
| `src/modules/shared/internal/redact.ts` | Pure recursive redaction and credentialed-URI scrubbing | 3 |
| `src/modules/shared/internal/logger.ts` | JSON-lines logger, levels, singleton | 3 |
| `src/modules/shared/internal/http.ts` | `noStoreJson`, `toErrorResponse` | 4 |
| `src/modules/validation/internal/base-units.ts` | `baseUnits` Zod schema | 5 |
| `src/modules/validation/internal/ids.ts` | `objectIdString`, `isObjectIdString` | 5 |
| `src/modules/config/internal/schema.ts` | Env schema, key list, static reasons | 6 |
| `src/modules/config/internal/load.ts` | `loadConfig`, memoization, `resetConfigForTests` | 6 |
| `.env.example` | Documents every config key | 6 |
| `tests/setup/*`, `tests/helpers/mongo.ts` | Replica-set harness, per-file DB, URI helpers | 7 |
| `src/modules/database/internal/client.ts` | Cached `MongoClient`, `getClient`, `getDb`, `closeDb` | 7 |
| `src/modules/database/internal/ping.ts` | Timer-raced `ping` | 7 |
| `src/modules/database/internal/errors.ts` | `hasErrorLabelDeep` (Task 8), `mapMongoError` (Task 9) | 8, 9 |
| `src/modules/database/internal/transaction.ts` | Bounded `withTransaction` loop | 8 |
| `src/modules/database/internal/names.ts` | Collection-name validation shared by indexes and collections | 9 |
| `src/modules/database/internal/indexes.ts` | Index registry, `ensureIndexes` | 9 |
| `src/modules/database/internal/typed-collection.ts` | Zod-validated collection wrapper | 9 |
| `src/app/api/health/route.ts`, `src/app/api/ready/route.ts` | Liveness and readiness | 10 |
| `src/instrumentation.ts` | Fail-fast config at server boot | 10 |
| `src/modules/{privacy,wallet,payments,blockchain,security}/index.ts` | Placeholder modules (`export {};`) | 11 |
| `tests/fixtures/lint/*.ts`, `tests/unit/lint/boundaries.test.ts` | Boundary-rule fixtures and test | 11 |
| `docs/adr/0001…0004-*.md`, `README.md`, `docs/OPEN_DECISIONS.md`, `docs/TECHNICAL_ARCHITECTURE.md` | Decision records and setup docs | 12 |
| `docs/adr/0005-helius-sdk-discovery.md` | Helius research ADR | 13 |

Each module's `index.ts` is its only public surface. Later tasks show the complete new contents of an `index.ts` whenever it grows.

---

### Task 1: Scaffold and toolchain

**Files:**
- Create: `package.json`, `bunfig.toml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `.prettierrc`, `.prettierignore`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `tests/unit/toolchain.test.ts`
- Modify: `.gitignore` (append; keep the two existing `.agenkit/memory/...` lines)
- Generated and committed: `bun.lock`

**Interfaces:**
- Consumes: nothing.
- Produces: the scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:unit`, `test:integration`, `test:coverage`, `format`, `format:check`; the `@/*` alias for `./src/*`, set in both `tsconfig.json` and `vitest.config.ts`; and the Vitest project named `unit` with `include: ["tests/unit/**/*.test.ts"]`.

- [ ] **Step 1: Confirm the toolchain and that the pinned versions exist**

Run:
```bash
node -v && bun -v && /usr/bin/mongod --version | head -1
for p in next@16.4.5 react@19.3.1 react-dom@19.3.1 mongodb@7.8.0 zod@4.6.7 typescript@6.0.3 @types/node@24.19.2 @types/react@19.3.0 @types/react-dom@19.3.0 eslint@9.39.5 eslint-config-next@16.4.5 eslint-config-prettier@10.1.8 prettier@3.9.10 vitest@5.1.0 @vitest/coverage-v8@5.1.0 vite@8.3.6 mongodb-memory-server-core@11.3.0; do printf '%s -> ' "$p"; npm view "$p" version; done
```
Expected: `v24.x.x`, `1.4.4`, `db version v7.0.12`, and every package line ending in its own pinned version. If any `npm view` prints nothing, stop and report to the Conductor. Do not substitute a version.

Also run `npm view next@16.4.6 dist.tarball time --json | head -5`, then check the Next.js release notes for 16.4.6. If 16.4.6 is a security release, use `16.4.6` for both `next` and `eslint-config-next` in Step 2, and note the change in ADR-0002 (Task 12). Otherwise keep `16.4.5`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "ghostwire",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.4.4",
  "engines": { "node": ">=24.0.0 <25" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:coverage": "vitest run --coverage",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "mongodb": "7.8.0",
    "next": "16.4.5",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitest/coverage-v8": "5.1.0",
    "eslint": "9.39.5",
    "eslint-config-next": "16.4.5",
    "eslint-config-prettier": "10.1.8",
    "mongodb-memory-server-core": "11.3.0",
    "prettier": "3.9.10",
    "typescript": "6.0.3",
    "vite": "8.3.6",
    "vitest": "5.1.0"
  }
}
```

- [ ] **Step 3: Create `bunfig.toml` and `.nvmrc`**

`bunfig.toml`:
```toml
[install]
exact = true
```

`.nvmrc` holds a single line:
```text
24
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowJs": false,
    "noEmit": true,
    "incremental": true,
    "types": ["node"],
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "*.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", ".next/cache", "tests/fixtures/**"]
}
```

TS 6 changed two defaults: `types` now defaults to `[]`, and `baseUrl` is deprecated. That is why `"types": ["node"]` is set and `paths` is used without `baseUrl`. Do not add `baseUrl`.

- [ ] **Step 5: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
```

- [ ] **Step 6: Append to `.gitignore`**

Keep the existing two lines. Append:
```gitignore

# dependencies and build output
node_modules/
.next/
out/
coverage/
next-env.d.ts
*.tsbuildinfo

# local data (README dev replica set uses ./.data/db)
.data/

# environment (only the example is committed)
.env
.env.*
!.env.example

# misc
*.log
.DS_Store
```

- [ ] **Step 7: Create `.prettierrc` and `.prettierignore`**

`.prettierrc`:
```json
{ "printWidth": 100, "trailingComma": "all", "singleQuote": false, "semi": true }
```

`.prettierignore`:
```text
.next/
node_modules/
coverage/
bun.lock
next-env.d.ts
docs/
AGENTS.md
agenkit.lock.json
.agenkit/
.claude/
```

- [ ] **Step 8: Create the base `eslint.config.mjs` (boundary rules come in Task 11)**

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** Unused identifiers are errors; a leading underscore marks an intentionally unused one. */
const unusedVars = {
  files: ["**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
};

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    "tests/fixtures/**",
    ".agenkit/**",
    ".claude/**",
  ]),
  ...nextVitals,
  ...nextTs,
  unusedVars,
  prettier,
]);
```

- [ ] **Step 9: Create `vitest.config.ts` (unit project only; Task 7 adds integration)**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/layout.tsx", "src/app/page.tsx", "src/modules/*/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], testTimeout: 10_000 },
      },
    ],
  },
});
```

- [ ] **Step 10: Create the placeholder app shell**

`src/app/layout.tsx` (no `next/font/google`, because it fetches over the network at build time):
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "GHOST WIRE",
  description: "Your money. Your business. Your privacy.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function HomePage() {
  return (
    <main>
      <h1>GHOST WIRE</h1>
      <p>Your money. Your business. Your privacy.</p>
    </main>
  );
}
```

- [ ] **Step 11: Install dependencies**

Run: `bun install`
Expected: `bun.lock` is created and the output lists 17 direct packages installed. Bun may print `Blocked N postinstalls`. **Do not** run `bun pm trust`. Copy the blocked package names into your task report so ADR-0002 (Task 12) can record them. Then run `bun install --frozen-lockfile`. Expected: it exits 0 with `no changes` or equivalent.

Confirm the pins are exact: `grep -nE '"[~^]' package.json`. Expected: no output.

- [ ] **Step 12: Write the toolchain smoke test**

`tests/unit/toolchain.test.ts`. It proves that the TS target compiles bigint literals and that Vitest runs on Node 24:
```ts
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("compiles bigint literals and runs on Node 24", () => {
    expect(2n ** 64n).toBe(18446744073709551616n);
    expect(process.versions.node.split(".")[0]).toBe("24");
  });
});
```

- [ ] **Step 13: Run the full gate**

Run: `bun run test`
Expected: `Test Files  1 passed (1)`, `Tests  1 passed (1)`.

Run: `bun run typecheck`
Expected: `next typegen` finishes, then `tsc --noEmit` exits 0 with no output.

Run: `bun run lint`
Expected: exits 0 with no output.

Run: `bun run build`
Expected: `✓ Compiled successfully` and a route table that lists `/` (static). It exits 0. Then run `git status --short tsconfig.json`. If Next rewrote `tsconfig.json`, keep its edit, mention it in your task report for ADR-0002, and stage it below.

- [ ] **Step 14: Commit**

```bash
git add package.json bun.lock bunfig.toml .nvmrc tsconfig.json next.config.ts .gitignore .prettierrc .prettierignore eslint.config.mjs vitest.config.ts src/app/layout.tsx src/app/page.tsx tests/unit/toolchain.test.ts
git commit -m "chore: scaffold Next.js app with pinned Bun/Node 24 toolchain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `shared`: AppError hierarchy and Result

**Files:**
- Create: `src/modules/shared/internal/errors.ts`, `src/modules/shared/internal/result.ts`, `src/modules/shared/index.ts`
- Test: `tests/unit/shared/errors.test.ts`, `tests/unit/shared/result.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `@/modules/shared`):
  - `class AppError extends Error { readonly code: string; readonly httpStatus: number; readonly safeMessage: string; constructor(init: AppErrorInit) }`
  - `interface AppErrorInit { code; httpStatus; safeMessage; message?; cause? }`
  - `interface AppErrorOptions { code?; safeMessage?; message?; cause? }`
  - `ValidationError(options?)` (400 `VALIDATION_FAILED` "Invalid request"), `NotFoundError(options?)` (404 `NOT_FOUND` "Not found"), `ConflictError(options?)` (409 `CONFLICT` "Conflict"), `InternalError(options?)` (500 `INTERNAL` "Internal error")
  - `DependencyUnavailableError(dependency: DependencyName, options?)` (503 `DEPENDENCY_UNAVAILABLE` "Service temporarily unavailable"), with `readonly dependency`
  - `type DependencyName = "database"`
  - `ConfigError(issues: readonly ConfigIssue[])` (500 `CONFIG_INVALID` "Internal error"), with `readonly issues` and `interface ConfigIssue { key: string; reason: string }`
  - `isAppError(value: unknown): value is AppError`
  - `type Result<T, E = AppError>`, `ok<T>(value): Result<T, never>`, `err<E>(error): Result<never, E>`, `isOk<T, E>(result): result is { ok: true; value: T }`

- [ ] **Step 1: Write the failing error tests**

`tests/unit/shared/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "@/modules/shared";

describe("AppError subclasses", () => {
  it.each([
    {
      name: "ValidationError",
      make: () => new ValidationError(),
      code: "VALIDATION_FAILED",
      status: 400,
      safe: "Invalid request",
    },
    {
      name: "NotFoundError",
      make: () => new NotFoundError(),
      code: "NOT_FOUND",
      status: 404,
      safe: "Not found",
    },
    {
      name: "ConflictError",
      make: () => new ConflictError(),
      code: "CONFLICT",
      status: 409,
      safe: "Conflict",
    },
    {
      name: "DependencyUnavailableError",
      make: () => new DependencyUnavailableError("database"),
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      safe: "Service temporarily unavailable",
    },
    {
      name: "InternalError",
      make: () => new InternalError(),
      code: "INTERNAL",
      status: 500,
      safe: "Internal error",
    },
  ])("$name has the documented defaults", ({ name, make, code, status, safe }) => {
    const error = make();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
    expect(error.safeMessage).toBe(safe);
    expect(error.message).toBe(safe);
    expect(isAppError(error)).toBe(true);
  });

  it("lets callers override code, safeMessage and the internal message", () => {
    const error = new ConflictError({
      code: "DUPLICATE_KEY",
      safeMessage: "Resource already exists",
      message: "users: duplicate key on email",
    });
    expect(error.code).toBe("DUPLICATE_KEY");
    expect(error.safeMessage).toBe("Resource already exists");
    expect(error.message).toBe("users: duplicate key on email");
    expect(error.httpStatus).toBe(409);
  });

  it("keeps the cause", () => {
    const cause = new Error("driver detail");
    const error = new InternalError({ cause });
    expect(error.cause).toBe(cause);
  });

  it("does not define cause when none is given", () => {
    expect(Object.hasOwn(new NotFoundError(), "cause")).toBe(false);
  });

  it("DependencyUnavailableError records the dependency", () => {
    expect(new DependencyUnavailableError("database").dependency).toBe("database");
  });
});

describe("ConfigError", () => {
  const issues = [
    { key: "MONGODB_URI", reason: "Required" },
    { key: "LOG_LEVEL", reason: "Invalid option: expected one of debug|info|warn|error" },
  ];

  it("lists keys and reasons in the message", () => {
    expect(new ConfigError(issues).message).toBe(
      "Invalid configuration: MONGODB_URI (Required); LOG_LEVEL (Invalid option: expected one of debug|info|warn|error)",
    );
  });

  it("is a CONFIG_INVALID 500 with a generic safe message", () => {
    const error = new ConfigError(issues);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("ConfigError");
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.httpStatus).toBe(500);
    expect(error.safeMessage).toBe("Internal error");
  });

  it("stores a frozen copy of the issues", () => {
    const error = new ConfigError(issues);
    expect(error.issues).toEqual(issues);
    expect(error.issues).not.toBe(issues);
    expect(Object.isFrozen(error.issues)).toBe(true);
  });
});

describe("isAppError", () => {
  it("is false for anything that is not an AppError", () => {
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError({ code: "X", httpStatus: 400, safeMessage: "x" })).toBe(false);
    expect(isAppError("boom")).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
```

`tests/unit/shared/result.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { NotFoundError, err, isOk, ok, type Result } from "@/modules/shared";

describe("Result", () => {
  it("ok wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("err wraps an error", () => {
    const error = new NotFoundError();
    expect(err(error)).toEqual({ ok: false, error });
  });

  it("isOk narrows both branches", () => {
    const results: Result<number>[] = [ok(1), err(new NotFoundError())];
    const values = results.map((r) => (isOk(r) ? r.value : r.error.code));
    expect(values).toEqual([1, "NOT_FOUND"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:unit -- tests/unit/shared`
Expected: FAIL. Both files report `Failed to resolve import "@/modules/shared"`.

- [ ] **Step 3: Implement `errors.ts`**

`src/modules/shared/internal/errors.ts`:
```ts
export interface AppErrorInit {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;
  /** Internal, may be detailed, never sent to clients. Defaults to safeMessage. */
  readonly message?: string;
  readonly cause?: unknown;
}

export interface AppErrorOptions {
  readonly code?: string;
  readonly safeMessage?: string;
  readonly message?: string;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;

  constructor(init: AppErrorInit) {
    super(init.message ?? init.safeMessage, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = new.target.name;
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.safeMessage = init.safeMessage;
  }
}

interface ErrorDefaults {
  readonly code: string;
  readonly httpStatus: number;
  readonly safeMessage: string;
}

function initFrom(defaults: ErrorDefaults, options: AppErrorOptions): AppErrorInit {
  return {
    code: options.code ?? defaults.code,
    httpStatus: defaults.httpStatus,
    safeMessage: options.safeMessage ?? defaults.safeMessage,
    message: options.message,
    cause: options.cause,
  };
}

export class ValidationError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "VALIDATION_FAILED", httpStatus: 400, safeMessage: "Invalid request" }, options));
  }
}

export class NotFoundError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "NOT_FOUND", httpStatus: 404, safeMessage: "Not found" }, options));
  }
}

export class ConflictError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "CONFLICT", httpStatus: 409, safeMessage: "Conflict" }, options));
  }
}

export type DependencyName = "database";

export class DependencyUnavailableError extends AppError {
  readonly dependency: DependencyName;

  constructor(dependency: DependencyName, options: AppErrorOptions = {}) {
    super(
      initFrom(
        {
          code: "DEPENDENCY_UNAVAILABLE",
          httpStatus: 503,
          safeMessage: "Service temporarily unavailable",
        },
        options,
      ),
    );
    this.dependency = dependency;
  }
}

export class InternalError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super(initFrom({ code: "INTERNAL", httpStatus: 500, safeMessage: "Internal error" }, options));
  }
}

export interface ConfigIssue {
  readonly key: string;
  readonly reason: string;
}

/** Startup-only. The message lists key names and static reasons; it never contains values. */
export class ConfigError extends AppError {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const frozen = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super({
      code: "CONFIG_INVALID",
      httpStatus: 500,
      safeMessage: "Internal error",
      message: `Invalid configuration: ${frozen.map((i) => `${i.key} (${i.reason})`).join("; ")}`,
    });
    this.issues = frozen;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
```

- [ ] **Step 4: Implement `result.ts`**

`src/modules/shared/internal/result.ts`:
```ts
import type { AppError } from "./errors";

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(
  result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } {
  return result.ok;
}
```

- [ ] **Step 5: Create the public entry**

`src/modules/shared/index.ts`:
```ts
export {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "./internal/errors";
export type { AppErrorInit, AppErrorOptions, ConfigIssue, DependencyName } from "./internal/errors";
export { err, isOk, ok } from "./internal/result";
export type { Result } from "./internal/result";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test:unit -- tests/unit/shared`
Expected: PASS, with `Tests  16 passed (16)` (13 in `errors.test.ts` and 3 in `result.test.ts`).

- [ ] **Step 7: Lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: both exit 0 with no findings.

- [ ] **Step 8: Commit**

```bash
git add src/modules/shared tests/unit/shared/errors.test.ts tests/unit/shared/result.test.ts
git commit -m "feat(shared): add AppError hierarchy and Result helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `shared`: redacting logger

**Files:**
- Create: `src/modules/shared/internal/redact.ts`, `src/modules/shared/internal/logger.ts`
- Modify: `src/modules/shared/index.ts` (full new contents below)
- Test: `tests/unit/shared/logger.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. `logger.ts` imports `./redact`.
- Produces (from `@/modules/shared`):
  - `LOG_LEVELS: readonly ["debug", "info", "warn", "error"]` and `type LogLevel`
  - `type LogFields = Readonly<Record<string, unknown>>`
  - `interface Logger { debug|info|warn|error(msg: string, fields?: LogFields): void }`
  - `interface LogSink { write(level: LogLevel, line: string): void }`
  - `interface CreateLoggerOptions { level: LogLevel | (() => LogLevel); sink?: LogSink; now?: () => Date }`
  - `createLogger(options): Logger`
  - `const logger: Logger` (singleton, initial level `"info"`) and `setLogLevel(level: LogLevel): void`
  - `REDACTED: "[REDACTED]"` and `redact(value: unknown): unknown`
- Internal to `shared` only: `scrubString(value: string): string`, which `logger.ts` uses to scrub `msg`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/shared/logger.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  createLogger,
  logger,
  redact,
  setLogLevel,
  type LogLevel,
  type LogSink,
} from "@/modules/shared";

function memorySink(): LogSink & { readonly lines: { level: LogLevel; line: string }[] } {
  const lines: { level: LogLevel; line: string }[] = [];
  return {
    lines,
    write(level, line) {
      lines.push({ level, line });
    },
  };
}

const FIXED = new Date("2026-11-12T10:00:00.000Z");

function parsed(sink: ReturnType<typeof memorySink>): Record<string, unknown>[] {
  return sink.lines.map((l) => JSON.parse(l.line) as Record<string, unknown>);
}

describe("redact", () => {
  it("redacts sensitive keys case-insensitively, in nested objects and arrays", () => {
    const out = redact({
      user: { name: "ana", ViewingKey: "vk-1", apiKey: "ak-1", PASSWORD: "pw" },
      headers: { Authorization: "Bearer abc", Cookie: "sid=1" },
      wallets: [{ seedPhrase: "words", label: "main" }, { privateKey: "pk" }],
      signature: "sig",
      mnemonic: "m",
      clientSecret: "s",
      refreshToken: "t",
    });
    expect(out).toEqual({
      user: { name: "ana", ViewingKey: REDACTED, apiKey: REDACTED, PASSWORD: REDACTED },
      headers: { Authorization: REDACTED, Cookie: REDACTED },
      wallets: [{ seedPhrase: REDACTED, label: "main" }, { privateKey: REDACTED }],
      signature: REDACTED,
      mnemonic: REDACTED,
      clientSecret: REDACTED,
      refreshToken: REDACTED,
    });
  });

  it("redacts a whole object under a sensitive key", () => {
    expect(redact({ keys: { a: 1 } })).toEqual({ keys: REDACTED });
  });

  it("over-redacts keys such as idempotencyKey (intentional safe failure)", () => {
    expect(redact({ idempotencyKey: "k-1" })).toEqual({ idempotencyKey: REDACTED });
  });

  it("scrubs credentials embedded in URI strings", () => {
    expect(redact({ uri: "mongodb://alice:s3cr3t@db.example.com:27017/app" })).toEqual({
      uri: "mongodb://[REDACTED]@db.example.com:27017/app",
    });
    expect(redact("see https://example.com/a@b")).toBe("see https://example.com/a@b");
  });

  it("walks Map and Set", () => {
    const out = redact({
      m: new Map<string, string>([
        ["apiKey", "x"],
        ["safe", "y"],
      ]),
      s: new Set(["a", "b"]),
    });
    expect(out).toEqual({ m: { apiKey: REDACTED, safe: "y" }, s: ["a", "b"] });
  });

  it("serializes errors with their cause and scrubs their messages", () => {
    const inner = new Error("inner");
    const outer = new Error("connect failed mongodb://bob:pw@h:1", { cause: inner });
    const out = redact({ err: outer }) as { err: Record<string, unknown> };
    expect(out.err.name).toBe("Error");
    expect(out.err.message).toBe("connect failed mongodb://[REDACTED]@h:1");
    expect(typeof out.err.stack).toBe("string");
    expect(String(out.err.stack)).not.toContain("bob:pw");
    expect(out.err.cause).toMatchObject({ name: "Error", message: "inner" });
  });

  it("converts bigint to a decimal string", () => {
    expect(redact({ amount: 18446744073709551616n })).toEqual({ amount: "18446744073709551616" });
  });

  it("marks cycles but not shared non-cyclic references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(redact(a)).toEqual({ name: "a", self: "[Circular]" });
    const shared = { v: 1 };
    expect(redact({ x: shared, y: shared })).toEqual({ x: { v: 1 }, y: { v: 1 } });
  });

  it("truncates values nested deeper than 8 levels", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 12; i += 1) deep = { a: deep };
    let cursor = redact(deep) as Record<string, unknown>;
    for (let i = 0; i < 8; i += 1) cursor = cursor.a as Record<string, unknown>;
    expect(typeof cursor).toBe("object");
    expect(cursor.a).toBe("[Truncated]");
  });
});

describe("createLogger", () => {
  it("writes one JSON line with ts, level, msg and redacted fields", () => {
    const sink = memorySink();
    const log = createLogger({ level: "debug", sink, now: () => FIXED });
    log.info("hello mongodb://u:p@h", { requestId: "r-1", apiKey: "secret-value" });
    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]?.level).toBe("info");
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "info",
      msg: "hello mongodb://[REDACTED]@h",
      requestId: "r-1",
      apiKey: REDACTED,
    });
    expect(sink.lines[0]?.line).not.toContain("secret-value");
  });

  it("lets reserved keys win over same-named fields", () => {
    const sink = memorySink();
    createLogger({ level: "debug", sink, now: () => FIXED }).warn("real", {
      ts: "spoof",
      level: "spoof",
      msg: "spoof",
      extra: 1,
    });
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "warn",
      msg: "real",
      extra: 1,
    });
  });

  it("drops lines below the configured level", () => {
    const sink = memorySink();
    const log = createLogger({ level: "warn", sink, now: () => FIXED });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(parsed(sink).map((l) => l.msg)).toEqual(["w", "e"]);
  });

  it("re-reads a level getter on every call", () => {
    const sink = memorySink();
    let level: LogLevel = "error";
    const log = createLogger({ level: () => level, sink, now: () => FIXED });
    log.info("dropped");
    level = "debug";
    log.info("kept");
    expect(parsed(sink).map((l) => l.msg)).toEqual(["kept"]);
  });

  it("writes a fallback line when serialization fails", () => {
    const sink = memorySink();
    const log = createLogger({ level: "debug", sink, now: () => FIXED });
    log.error("bad", {
      bad: {
        toJSON() {
          throw new Error("nope");
        },
      },
    });
    expect(parsed(sink)[0]).toEqual({
      ts: "2026-11-12T10:00:00.000Z",
      level: "error",
      msg: "bad",
      logError: "serialization_failed",
    });
  });

  it("never throws, even when the sink throws", () => {
    const log = createLogger({
      level: "debug",
      sink: {
        write() {
          throw new Error("disk full");
        },
      },
    });
    expect(() => log.error("x")).not.toThrow();
  });
});

describe("logger singleton", () => {
  afterEach(() => {
    setLogLevel("info");
  });

  it("honours setLogLevel and routes warn/error to stderr", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const errOut = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("error");
    logger.info("dropped");
    logger.error("kept");
    expect(out).not.toHaveBeenCalled();
    expect(errOut).toHaveBeenCalledTimes(1);
    const line = String(errOut.mock.calls[0]?.[0]);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toMatchObject({ level: "error", msg: "kept" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:unit -- tests/unit/shared/logger.test.ts`
Expected: FAIL. `redact`, `createLogger` and `setLogLevel` are not exported (for example `TypeError: createLogger is not a function`, or a missing-export error).

- [ ] **Step 3: Implement `redact.ts`**

`src/modules/shared/internal/redact.ts`:
```ts
export const REDACTED = "[REDACTED]" as const;

const SENSITIVE_KEY_PARTS = [
  "key",
  "seed",
  "secret",
  "token",
  "password",
  "mnemonic",
  "viewingkey",
  "privatekey",
  "signature",
  "authorization",
  "cookie",
] as const;

const CREDENTIAL_URI = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const MAX_DEPTH = 8;
const CIRCULAR = "[Circular]";
const TRUNCATED = "[Truncated]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/** Replaces any `scheme://user:pass@` credential segment with `scheme://[REDACTED]@`. */
export function scrubString(value: string): string {
  return value.replace(CREDENTIAL_URI, `$1${REDACTED}@`);
}

/** Pure: returns a JSON-safe, redacted copy of `value`. Never mutates the input. */
export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet<object>());
}

function walk(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (ancestors.has(value)) return CIRCULAR;

  ancestors.add(value);
  try {
    if (value instanceof Error) return walkError(value, depth, ancestors);
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, ancestors));
    if (value instanceof Map) {
      return walkEntries(
        Array.from(value.entries(), ([k, v]) => [String(k), v] as const),
        depth,
        ancestors,
      );
    }
    if (value instanceof Set) return Array.from(value, (item) => walk(item, depth + 1, ancestors));
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") return walk(toJSON.call(value), depth, ancestors);
    return walkEntries(Object.entries(value), depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function walkEntries(
  entries: readonly (readonly [string, unknown])[],
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, ancestors);
  }
  return out;
}

function walkError(error: Error, depth: number, ancestors: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = { name: error.name, message: scrubString(error.message) };
  const { code, errorLabels } = error as { code?: unknown; errorLabels?: unknown };
  if (code !== undefined) out.code = walk(code, depth + 1, ancestors);
  if (Array.isArray(errorLabels)) out.errorLabels = walk(errorLabels, depth + 1, ancestors);
  if (typeof error.stack === "string") out.stack = scrubString(error.stack);
  if (error.cause !== undefined) out.cause = walk(error.cause, depth + 1, ancestors);
  return out;
}
```

- [ ] **Step 4: Implement `logger.ts`**

`src/modules/shared/internal/logger.ts`:
```ts
import { redact, scrubString } from "./redact";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export interface LogSink {
  write(level: LogLevel, line: string): void;
}

export interface CreateLoggerOptions {
  readonly level: LogLevel | (() => LogLevel);
  /** Default: debug/info -> process.stdout, warn/error -> process.stderr. */
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

const RANK: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

const processSink: LogSink = {
  write(level, line) {
    const stream = level === "warn" || level === "error" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const sink = options.sink ?? processSink;
  const now = options.now ?? (() => new Date());
  const configured = options.level;
  const currentLevel = typeof configured === "function" ? configured : () => configured;

  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    try {
      if (RANK[level] < RANK[currentLevel()]) return;
      const reserved = { ts: now().toISOString(), level, msg: scrubString(msg) };
      let line: string;
      try {
        const redacted = fields === undefined ? {} : redact(fields);
        line = JSON.stringify(Object.assign({}, reserved, isRecord(redacted) ? redacted : {}, reserved));
      } catch {
        line = JSON.stringify({ ...reserved, logError: "serialization_failed" });
      }
      sink.write(level, line);
    } catch {
      // The logger must never throw into its caller.
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}

let globalLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export const logger: Logger = createLogger({ level: () => globalLevel });
```

- [ ] **Step 5: Replace `src/modules/shared/index.ts` with the full new contents**

```ts
export {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "./internal/errors";
export type { AppErrorInit, AppErrorOptions, ConfigIssue, DependencyName } from "./internal/errors";
export { err, isOk, ok } from "./internal/result";
export type { Result } from "./internal/result";
export { LOG_LEVELS, createLogger, logger, setLogLevel } from "./internal/logger";
export type { CreateLoggerOptions, LogFields, LogLevel, LogSink, Logger } from "./internal/logger";
export { REDACTED, redact } from "./internal/redact";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test:unit -- tests/unit/shared/logger.test.ts`
Expected: PASS, with `Tests  16 passed (16)`.

- [ ] **Step 7: Run the full unit suite, lint and typecheck**

Run: `bun run test:unit && bun run lint && bun run typecheck`
Expected: every unit test passes (33 tests across 4 files), and lint and typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/modules/shared tests/unit/shared/logger.test.ts
git commit -m "feat(shared): add redacting JSON-lines logger" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `shared`: route response helpers

**Files:**
- Create: `src/modules/shared/internal/http.ts`
- Modify: `src/modules/shared/index.ts` (full new contents below)
- Test: `tests/unit/shared/http.test.ts`

**Interfaces:**
- Consumes: `isAppError`, `DependencyUnavailableError`, and the `logger` singleton (Tasks 2 and 3).
- Produces (from `@/modules/shared`):
  - `noStoreJson(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response`. The status defaults to 200, and it always sets `Cache-Control: no-store` and `Content-Type: application/json`.
  - `toErrorResponse(error: unknown): Response`. It logs `logger.error("request failed", { err: error })`. An `AppError` maps to `{ code, message: safeMessage }` with the error's `httpStatus`, and `DependencyUnavailableError` also adds `Retry-After: 5`. Anything else maps to `500 { code: "INTERNAL", message: "Internal error" }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/shared/http.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import {
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  logger,
  noStoreJson,
  toErrorResponse,
} from "@/modules/shared";

const SENTINEL = "SENTINEL-INTERNAL-DETAIL";

describe("noStoreJson", () => {
  it("serializes the body with no-store and JSON content type", async () => {
    const res = noStoreJson({ status: "ok" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("applies status and extra headers but never drops no-store", () => {
    const res = noStoreJson(
      { a: 1 },
      { status: 503, headers: { "Retry-After": "5", "Cache-Control": "max-age=60" } },
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

function silenceLoggerError() {
  return vi.spyOn(logger, "error").mockImplementation(() => undefined);
}

describe("toErrorResponse", () => {

  it.each([
    { error: new ValidationError({ message: SENTINEL }), status: 400, code: "VALIDATION_FAILED", message: "Invalid request" },
    { error: new NotFoundError({ message: SENTINEL }), status: 404, code: "NOT_FOUND", message: "Not found" },
    { error: new ConflictError({ message: SENTINEL }), status: 409, code: "CONFLICT", message: "Conflict" },
    {
      error: new DependencyUnavailableError("database", { message: SENTINEL }),
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Service temporarily unavailable",
    },
    { error: new InternalError({ message: SENTINEL }), status: 500, code: "INTERNAL", message: "Internal error" },
    {
      error: new ConfigError([{ key: SENTINEL, reason: "Required" }]),
      status: 500,
      code: "CONFIG_INVALID",
      message: "Internal error",
    },
  ])("maps $code to $status with only the safe message", async ({ error, status, code, message }) => {
    const logError = silenceLoggerError();
    const res = toErrorResponse(error);
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code, message });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("stack");
    expect(logError).toHaveBeenCalledWith("request failed", { err: error });
  });

  it("adds Retry-After only for DependencyUnavailableError", () => {
    silenceLoggerError();
    expect(toErrorResponse(new DependencyUnavailableError("database")).headers.get("retry-after")).toBe("5");
    expect(toErrorResponse(new NotFoundError()).headers.get("retry-after")).toBeNull();
  });

  it("maps unknown errors and non-Error throws to a generic 500", async () => {
    const logError = silenceLoggerError();
    for (const thrown of [new Error(SENTINEL), SENTINEL, { message: SENTINEL }]) {
      const res = toErrorResponse(thrown);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ code: "INTERNAL", message: "Internal error" });
      expect(text).not.toContain(SENTINEL);
    }
    expect(logError).toHaveBeenCalledTimes(3);
  });

  it("keeps cause out of the response", async () => {
    silenceLoggerError();
    const res = toErrorResponse(new InternalError({ cause: new Error(SENTINEL) }));
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:unit -- tests/unit/shared/http.test.ts`
Expected: FAIL. `noStoreJson` and `toErrorResponse` are not exported (`TypeError: ... is not a function`).

- [ ] **Step 3: Implement `http.ts`**

`src/modules/shared/internal/http.ts`:
```ts
import { DependencyUnavailableError, isAppError } from "./errors";
import { logger } from "./logger";

const RETRY_AFTER_SECONDS = "5";

export function noStoreJson(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** Logs the full error server-side; the client only ever sees a stable code and safe message. */
export function toErrorResponse(error: unknown): Response {
  logger.error("request failed", { err: error });
  if (isAppError(error)) {
    const headers: Record<string, string> =
      error instanceof DependencyUnavailableError ? { "Retry-After": RETRY_AFTER_SECONDS } : {};
    return noStoreJson(
      { code: error.code, message: error.safeMessage },
      { status: error.httpStatus, headers },
    );
  }
  return noStoreJson({ code: "INTERNAL", message: "Internal error" }, { status: 500 });
}
```

- [ ] **Step 4: Replace `src/modules/shared/index.ts` with the full new contents**

```ts
export {
  AppError,
  ConfigError,
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  NotFoundError,
  ValidationError,
  isAppError,
} from "./internal/errors";
export type { AppErrorInit, AppErrorOptions, ConfigIssue, DependencyName } from "./internal/errors";
export { err, isOk, ok } from "./internal/result";
export type { Result } from "./internal/result";
export { LOG_LEVELS, createLogger, logger, setLogLevel } from "./internal/logger";
export type { CreateLoggerOptions, LogFields, LogLevel, LogSink, Logger } from "./internal/logger";
export { REDACTED, redact } from "./internal/redact";
export { noStoreJson, toErrorResponse } from "./internal/http";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test:unit -- tests/unit/shared/http.test.ts`
Expected: PASS, with `Tests  11 passed (11)`.

- [ ] **Step 6: Run the full unit suite, lint and typecheck**

Run: `bun run test:unit && bun run lint && bun run typecheck`
Expected: every test passes and both checks exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/modules/shared tests/unit/shared/http.test.ts
git commit -m "feat(shared): add noStoreJson and toErrorResponse route helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: `validation`: baseUnits and objectIdString

**Files:**
- Create: `src/modules/validation/internal/base-units.ts`, `src/modules/validation/internal/ids.ts`, `src/modules/validation/index.ts`
- Test: `tests/unit/validation/base-units.test.ts`, `tests/unit/validation/object-id.test.ts`

**Interfaces:**
- Consumes: `zod` only. `validation` imports no other module.
- Produces (from `@/modules/validation`):
  - `baseUnits: z.ZodType<bigint, bigint | string>` and `type BaseUnits = bigint`
  - `objectIdString: z.ZodType<ObjectIdString, string>`. It outputs lowercase hex.
  - `type ObjectIdString` (a branded string, `z.output` of the branded schema)
  - `isObjectIdString(value: unknown): value is ObjectIdString`. It accepts lowercase 24-hex only.

- [ ] **Step 1: Write the failing tests**

`tests/unit/validation/base-units.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baseUnits } from "@/modules/validation";

describe("baseUnits", () => {
  it.each<[string, bigint]>([
    ["0", 0n],
    ["18446744073709551616", 18446744073709551616n],
    ["1000000", 1000000n],
  ])("accepts the string %s", (input, expected) => {
    expect(baseUnits.parse(input)).toBe(expected);
  });

  it("accepts non-negative bigints unchanged", () => {
    expect(baseUnits.parse(5n)).toBe(5n);
    expect(baseUnits.parse(0n)).toBe(0n);
  });

  it.each([1.5, 1, 0, -1, Number.NaN])("rejects the JS number %s", (input) => {
    expect(baseUnits.safeParse(input).success).toBe(false);
  });

  it.each(["1.5", "-1", "1e3", " 1", "1 ", "01", "00", "", "+1", "0x10", "1_000"])(
    "rejects the string %j",
    (input) => {
      expect(baseUnits.safeParse(input).success).toBe(false);
    },
  );

  it("rejects negative bigints", () => {
    expect(baseUnits.safeParse(-1n).success).toBe(false);
  });

  it.each([null, undefined, true, {}, []])("rejects the non-amount value %j", (input) => {
    expect(baseUnits.safeParse(input).success).toBe(false);
  });

  it("never echoes the input in its issues", () => {
    const result = baseUnits.safeParse("99SENTINEL99");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain("SENTINEL");
  });
});
```

`tests/unit/validation/object-id.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isObjectIdString, objectIdString } from "@/modules/validation";

const LOWER = "507f1f77bcf86cd799439011";

describe("objectIdString", () => {
  it("accepts a lowercase 24-hex string", () => {
    expect(objectIdString.parse(LOWER)).toBe(LOWER);
  });

  it("normalizes uppercase hex to lowercase", () => {
    expect(objectIdString.parse(LOWER.toUpperCase())).toBe(LOWER);
  });

  it.each([LOWER.slice(0, 23), `${LOWER}0`, "g".repeat(24), "", 123, null])(
    "rejects %j",
    (input) => {
      expect(objectIdString.safeParse(input).success).toBe(false);
    },
  );
});

describe("isObjectIdString", () => {
  it("is true for a lowercase 24-hex string", () => {
    expect(isObjectIdString(LOWER)).toBe(true);
  });

  it("is false for uppercase, wrong length and non-strings", () => {
    expect(isObjectIdString(LOWER.toUpperCase())).toBe(false);
    expect(isObjectIdString(LOWER.slice(1))).toBe(false);
    expect(isObjectIdString(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:unit -- tests/unit/validation`
Expected: FAIL with `Failed to resolve import "@/modules/validation"`.

- [ ] **Step 3: Implement `base-units.ts`**

`src/modules/validation/internal/base-units.ts`:
```ts
import { z } from "zod";

const BASE_UNITS_STRING = /^(0|[1-9][0-9]*)$/;

/**
 * Integer amount in an asset's smallest unit. Accepts a non-negative bigint or a canonical
 * decimal string and always outputs bigint. Never accepts a JS number (no floating point).
 * No upper bound here: asset-specific bounds belong to the payments module.
 */
export const baseUnits: z.ZodType<bigint, bigint | string> = z.union([
  z
    .bigint({ error: "Must be a bigint or a base-units integer string" })
    .nonnegative({ error: "Must not be negative" }),
  z
    .string({ error: "Must be a bigint or a base-units integer string" })
    .regex(BASE_UNITS_STRING, {
      error: "Must be a non-negative integer string without leading zeros",
    })
    .transform((value) => BigInt(value)),
]);

export type BaseUnits = bigint;
```

- [ ] **Step 4: Implement `ids.ts`**

`src/modules/validation/internal/ids.ts`:
```ts
import { z } from "zod";

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
const OBJECT_ID_LOWER = /^[0-9a-f]{24}$/;

const objectIdSchema = z
  .string({ error: "Must be a 24-character hex string" })
  .regex(OBJECT_ID_HEX, { error: "Must be a 24-character hex string" })
  .transform((value) => value.toLowerCase())
  .brand<"ObjectIdString">();

export type ObjectIdString = z.output<typeof objectIdSchema>;

export const objectIdString: z.ZodType<ObjectIdString, string> = objectIdSchema;

export function isObjectIdString(value: unknown): value is ObjectIdString {
  return typeof value === "string" && OBJECT_ID_LOWER.test(value);
}
```

- [ ] **Step 5: Create the public entry**

`src/modules/validation/index.ts`:
```ts
export { baseUnits } from "./internal/base-units";
export type { BaseUnits } from "./internal/base-units";
export { isObjectIdString, objectIdString } from "./internal/ids";
export type { ObjectIdString } from "./internal/ids";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test:unit -- tests/unit/validation`
Expected: PASS, with `Tests  37 passed (37)` (27 in `base-units.test.ts` and 10 in `object-id.test.ts`).

- [ ] **Step 7: Run the full unit suite, lint and typecheck**

Run: `bun run test:unit && bun run lint && bun run typecheck`
Expected: every test passes and both checks exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/modules/validation tests/unit/validation
git commit -m "feat(validation): add baseUnits and objectIdString schemas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `config`: env schema and fail-fast loadConfig

**Files:**
- Create: `src/modules/config/internal/schema.ts`, `src/modules/config/internal/load.ts`, `src/modules/config/index.ts`, `.env.example`
- Test: `tests/unit/config/load-config.test.ts`

**Interfaces:**
- Consumes: `LOG_LEVELS`, `LogLevel`, `ConfigError`, `ConfigIssue` and `setLogLevel` from `@/modules/shared`.
- Produces (from `@/modules/config`):
  - `type NodeEnv = "development" | "test" | "production"`
  - `interface AppConfig { readonly NODE_ENV: NodeEnv; readonly MONGODB_URI: string; readonly MONGODB_DB_NAME: string; readonly LOG_LEVEL: LogLevel }`
  - `type EnvSource = Readonly<Record<string, string | undefined>>`
  - `loadConfig(env?: EnvSource): AppConfig`. With no argument it parses `process.env` once, memoizes a frozen result and calls `setLogLevel`. With an explicit `env` it is pure: it returns a fresh frozen object and never touches the cache or the logger. It throws `ConfigError`.
  - `resetConfigForTests(): void`. It clears the cache only.

- [ ] **Step 1: Write the failing tests**

`tests/unit/config/load-config.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, resetConfigForTests, type EnvSource } from "@/modules/config";
import { ConfigError, logger, setLogLevel } from "@/modules/shared";

const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "warn",
} satisfies EnvSource;

const SENTINEL = "SENTINEL-VALUE-123";

function configErrorOf(env: EnvSource): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error("expected loadConfig to throw ConfigError");
}

describe("loadConfig(env)", () => {
  it("parses a valid environment into a frozen AppConfig", () => {
    const config = loadConfig(VALID);
    expect(config).toEqual(VALID);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("defaults LOG_LEVEL to info", () => {
    expect(loadConfig({ ...VALID, LOG_LEVEL: undefined }).LOG_LEVEL).toBe("info");
  });

  it("treats empty strings as missing", () => {
    expect(configErrorOf({ ...VALID, MONGODB_DB_NAME: "" }).issues).toEqual([
      { key: "MONGODB_DB_NAME", reason: "Required" },
    ]);
    expect(loadConfig({ ...VALID, LOG_LEVEL: "" }).LOG_LEVEL).toBe("info");
  });

  it("ignores unknown keys", () => {
    const config = loadConfig({ ...VALID, EXTRA_SECRET: "x" });
    expect(Object.keys(config).sort()).toEqual([
      "LOG_LEVEL",
      "MONGODB_DB_NAME",
      "MONGODB_URI",
      "NODE_ENV",
    ]);
  });

  it("accepts mongodb+srv and multi-host seed lists", () => {
    expect(loadConfig({ ...VALID, MONGODB_URI: "mongodb+srv://cluster.example.net/" }).MONGODB_URI).toBe(
      "mongodb+srv://cluster.example.net/",
    );
    expect(
      loadConfig({ ...VALID, MONGODB_URI: "mongodb://h1:27017,h2:27017/?replicaSet=rs0" }).MONGODB_URI,
    ).toBe("mongodb://h1:27017,h2:27017/?replicaSet=rs0");
  });

  it.each([
    {
      key: "NODE_ENV",
      value: SENTINEL,
      reason: "Invalid option: expected one of development|test|production",
    },
    {
      key: "MONGODB_URI",
      value: `postgres://${SENTINEL}`,
      reason: "Must be a mongodb:// or mongodb+srv:// connection string",
    },
    { key: "MONGODB_DB_NAME", value: `bad/${SENTINEL}`, reason: "Must be 1-63 chars of A-Z a-z 0-9 _ -" },
    {
      key: "LOG_LEVEL",
      value: SENTINEL,
      reason: "Invalid option: expected one of debug|info|warn|error",
    },
  ])("reports invalid $key without echoing its value", ({ key, value, reason }) => {
    const error = configErrorOf({ ...VALID, [key]: value });
    expect(error.issues).toEqual([{ key, reason }]);
    expect(error.message).toContain(key);
    expect(error.message).not.toContain(SENTINEL);
    expect(JSON.stringify(error.issues)).not.toContain(SENTINEL);
  });

  it("reports every missing required key in schema order", () => {
    const error = configErrorOf({});
    expect(error.issues).toEqual([
      { key: "NODE_ENV", reason: "Required" },
      { key: "MONGODB_URI", reason: "Required" },
      { key: "MONGODB_DB_NAME", reason: "Required" },
    ]);
  });

  it("rejects a database name longer than 63 characters", () => {
    expect(configErrorOf({ ...VALID, MONGODB_DB_NAME: "a".repeat(64) }).issues[0]?.key).toBe(
      "MONGODB_DB_NAME",
    );
  });

  it("formats the documented message", () => {
    const error = configErrorOf({ NODE_ENV: "test", MONGODB_DB_NAME: "x", LOG_LEVEL: "verbose" });
    expect(error.message).toBe(
      "Invalid configuration: MONGODB_URI (Required); LOG_LEVEL (Invalid option: expected one of debug|info|warn|error)",
    );
  });
});

describe("loadConfig() from process.env", () => {
  function stubValidEnv(): void {
    for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);
  }

  afterEach(() => {
    resetConfigForTests();
    setLogLevel("info");
    vi.unstubAllEnvs();
  });

  it("parses once and returns the cached object until reset", () => {
    stubValidEnv();
    resetConfigForTests();
    const first = loadConfig();
    vi.stubEnv("MONGODB_DB_NAME", "other_db");
    expect(loadConfig()).toBe(first);
    resetConfigForTests();
    expect(loadConfig().MONGODB_DB_NAME).toBe("other_db");
  });

  it("applies LOG_LEVEL to the shared logger", () => {
    stubValidEnv();
    vi.stubEnv("LOG_LEVEL", "error");
    resetConfigForTests();
    loadConfig();
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    logger.info("dropped");
    expect(out).not.toHaveBeenCalled();
  });

  it("explicit env neither reads nor writes the cache", () => {
    stubValidEnv();
    resetConfigForTests();
    const cached = loadConfig();
    expect(loadConfig({ ...VALID, MONGODB_DB_NAME: "explicit_db" }).MONGODB_DB_NAME).toBe("explicit_db");
    expect(loadConfig()).toBe(cached);
  });

  it("throws ConfigError and caches nothing when process.env is invalid", () => {
    stubValidEnv();
    vi.stubEnv("MONGODB_URI", "");
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(ConfigError);
    vi.stubEnv("MONGODB_URI", VALID.MONGODB_URI);
    expect(loadConfig().MONGODB_URI).toBe(VALID.MONGODB_URI);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:unit -- tests/unit/config`
Expected: FAIL with `Failed to resolve import "@/modules/config"`.

- [ ] **Step 3: Implement `schema.ts`**

`src/modules/config/internal/schema.ts`:
```ts
import { z } from "zod";
import { LOG_LEVELS } from "@/modules/shared";

export const NODE_ENVS = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/** Schema key order; ConfigError issues are reported in this order. */
export const ENV_KEYS = ["NODE_ENV", "MONGODB_URI", "MONGODB_DB_NAME", "LOG_LEVEL"] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

/** Scheme check only; WHATWG URL rejects valid multi-host seed lists. The driver parses fully. */
const MONGODB_URI_PATTERN = /^mongodb(\+srv)?:\/\/\S+$/;
/** MongoDB forbids /\. "$*<>:|? in database names. */
const DB_NAME_PATTERN = /^[A-Za-z0-9_-]{1,63}$/;

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS),
  MONGODB_URI: z.string().regex(MONGODB_URI_PATTERN),
  MONGODB_DB_NAME: z.string().regex(DB_NAME_PATTERN),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

/** Static reasons. They never contain the offending value. */
export const INVALID_REASONS: Readonly<Record<EnvKey, string>> = {
  NODE_ENV: "Invalid option: expected one of development|test|production",
  MONGODB_URI: "Must be a mongodb:// or mongodb+srv:// connection string",
  MONGODB_DB_NAME: "Must be 1-63 chars of A-Z a-z 0-9 _ -",
  LOG_LEVEL: "Invalid option: expected one of debug|info|warn|error",
};

export const REQUIRED_REASON = "Required";

export function isEnvKey(value: unknown): value is EnvKey {
  return typeof value === "string" && (ENV_KEYS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Implement `load.ts`**

`src/modules/config/internal/load.ts`:
```ts
import { ConfigError, setLogLevel, type ConfigIssue, type LogLevel } from "@/modules/shared";
import {
  ENV_KEYS,
  INVALID_REASONS,
  REQUIRED_REASON,
  envSchema,
  isEnvKey,
  type EnvKey,
  type NodeEnv,
} from "./schema";

export interface AppConfig {
  readonly NODE_ENV: NodeEnv;
  readonly MONGODB_URI: string;
  readonly MONGODB_DB_NAME: string;
  readonly LOG_LEVEL: LogLevel;
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

let cached: AppConfig | undefined;

/**
 * With no argument: parses process.env once, memoizes, and applies LOG_LEVEL to the logger.
 * With an explicit env: pure, never reads or writes the cache.
 * @throws ConfigError listing failing key names and static reasons (never values).
 */
export function loadConfig(env?: EnvSource): AppConfig {
  if (env !== undefined) return parseConfig(env);
  if (cached === undefined) {
    const config = parseConfig(process.env);
    setLogLevel(config.LOG_LEVEL);
    cached = config;
  }
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}

function parseConfig(env: EnvSource): AppConfig {
  const input: Partial<Record<EnvKey, string>> = {};
  for (const key of ENV_KEYS) {
    const raw = env[key];
    if (raw !== undefined && raw !== "") input[key] = raw;
  }
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const failing = new Set(result.error.issues.map((issue) => issue.path[0]).filter(isEnvKey));
    const issues: ConfigIssue[] = ENV_KEYS.filter((key) => failing.has(key)).map((key) => ({
      key,
      reason: input[key] === undefined ? REQUIRED_REASON : INVALID_REASONS[key],
    }));
    throw new ConfigError(issues);
  }
  return Object.freeze({ ...result.data });
}
```

- [ ] **Step 5: Create the public entry**

`src/modules/config/index.ts`:
```ts
export { loadConfig, resetConfigForTests } from "./internal/load";
export type { AppConfig, EnvSource } from "./internal/load";
export type { NodeEnv } from "./internal/schema";
```

- [ ] **Step 6: Create `.env.example`**

`.env.example`. It holds no secrets and no credentials:
```dotenv
# MongoDB connection string. Local dev needs a replica set for transactions:
#   mongod --replSet rs0 --dbpath ./.data/db  then  mongosh --eval "rs.initiate()"
MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGODB_DB_NAME=ghostwire_dev
# debug | info | warn | error (default: info)
LOG_LEVEL=info
# NODE_ENV is set by Next.js and Vitest; do not set it here.
# Tests only (optional): use a local mongod instead of downloading one.
# MONGOMS_SYSTEM_BINARY=/usr/bin/mongod
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test:unit -- tests/unit/config`
Expected: PASS, with `Tests  16 passed (16)`.

- [ ] **Step 8: Run the full unit suite, lint and typecheck**

Run: `bun run test:unit && bun run lint && bun run typecheck`
Expected: every test passes and both checks exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/modules/config tests/unit/config .env.example
git commit -m "feat(config): add Zod env schema and fail-fast loadConfig" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Integration harness and `database`: getDb, ping, closeDb

**Files:**
- Modify: `vitest.config.ts` (full new contents below, adding the `integration` project)
- Create: `tests/setup/integration.global.ts`, `tests/setup/integration.setup.ts`, `tests/helpers/mongo.ts`
- Create: `src/modules/database/internal/client.ts`, `src/modules/database/internal/ping.ts`, `src/modules/database/index.ts`
- Test: `tests/integration/database/ping.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `resetConfigForTests` and `AppConfig` from `@/modules/config`; `ConfigError`, `DependencyUnavailableError` and `logger` from `@/modules/shared`.
- Produces:
  - From `@/modules/database`: `getDb(): Promise<Db>`, `ping(timeoutMs?: number): Promise<void>` (default 2000, `RangeError` outside [1, 30000]), `closeDb(): Promise<void>` (idempotent, never throws), and the type-only re-exports `ClientSession, Db, Filter, Sort, WithId, ObjectId`.
  - Internal to `database`: `getClient(): Promise<MongoClient>` in `./client`, used by `transaction.ts` in Task 8.
  - Test harness: `inject("mongoUri"): string` (a `ProvidedContext` augmentation); `useDatabaseUri(uri: string): Promise<void>` and `startStandalone(): Promise<MongoMemoryServer>` from `tests/helpers/mongo.ts`. Each integration test file gets its own database, named `gw_test_<8 hex>`.

- [ ] **Step 1: Replace `vitest.config.ts` with the full new contents**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/layout.tsx", "src/app/page.tsx", "src/modules/*/index.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], testTimeout: 10_000 },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/integration.global.ts"],
          setupFiles: ["tests/setup/integration.setup.ts"],
          pool: "forks",
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
```

- [ ] **Step 2: Create the global setup**

`tests/setup/integration.global.ts`:
```ts
import type { TestProject } from "vitest/node";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * One single-node replica set for the whole integration run (transactions need a replica set).
 * MONGOMS_SYSTEM_BINARY=/usr/bin/mongod makes the library use the local 7.0.12 binary;
 * otherwise it downloads 7.0.12. MongoDB 8.x has no Ubuntu 20.04 build, so the version is pinned.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: "7.0.12" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  project.provide("mongoUri", replSet.getUri());
  return async () => {
    await replSet.stop({ doCleanup: true });
  };
}
```

- [ ] **Step 3: Create the per-file setup**

`tests/setup/integration.setup.ts`:
```ts
import { randomUUID } from "node:crypto";
import { afterAll, inject } from "vitest";
import { resetConfigForTests } from "@/modules/config";
import { closeDb, getDb } from "@/modules/database";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";
process.env.MONGODB_URI = inject("mongoUri");
// One database per test file, so files can run in parallel safely.
process.env.MONGODB_DB_NAME = `gw_test_${randomUUID().slice(0, 8)}`;
resetConfigForTests();

afterAll(async () => {
  try {
    await (await getDb()).dropDatabase();
  } catch {
    // The server may have been stopped on purpose by the test file.
  }
  await closeDb();
  resetConfigForTests();
});
```

- [ ] **Step 4: Create the helpers**

`tests/helpers/mongo.ts`:
```ts
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { resetConfigForTests } from "@/modules/config";
import { closeDb } from "@/modules/database";

/** Points the database module at a new URI: set env, drop the memoized config, close the client. */
export async function useDatabaseUri(uri: string): Promise<void> {
  process.env.MONGODB_URI = uri;
  resetConfigForTests();
  await closeDb();
}

/** A dedicated standalone server that a test may stop to simulate an outage. */
export async function startStandalone(): Promise<MongoMemoryServer> {
  return MongoMemoryServer.create({ binary: { version: "7.0.12" } });
}
```

- [ ] **Step 5: Write the failing integration test**

`tests/integration/database/ping.test.ts`:
```ts
import { afterEach, describe, expect, inject, it } from "vitest";
import { loadConfig } from "@/modules/config";
import { closeDb, getDb, ping } from "@/modules/database";
import { ConfigError, DependencyUnavailableError } from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("getDb", () => {
  it("returns the configured database", async () => {
    expect((await getDb()).databaseName).toBe(loadConfig().MONGODB_DB_NAME);
  });

  it("shares one client across concurrent callers", async () => {
    const [a, b] = await Promise.all([getDb(), getDb()]);
    expect(a.client).toBe(b.client);
  });

  it("rejects with DependencyUnavailableError when no server is reachable", async () => {
    await useDatabaseUri("mongodb://127.0.0.1:1/?directConnection=true");
    await expect(getDb()).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it("maps a URI the driver cannot parse to ConfigError on MONGODB_URI", async () => {
    await useDatabaseUri("mongodb://127.0.0.1:notaport/");
    const error: unknown = await getDb().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues.map((i) => i.key)).toEqual(["MONGODB_URI"]);
  });
});

describe("ping", () => {
  it("resolves against the running replica set", async () => {
    await expect(ping()).resolves.toBeUndefined();
  });

  it("rejects out-of-range timeouts with RangeError", async () => {
    await expect(ping(0)).rejects.toBeInstanceOf(RangeError);
    await expect(ping(30_001)).rejects.toBeInstanceOf(RangeError);
    await expect(ping(Number.NaN)).rejects.toBeInstanceOf(RangeError);
  });

  it("throws DependencyUnavailableError within the timeout once the server stops", async () => {
    const standalone = await startStandalone();
    let stopped = false;
    try {
      await useDatabaseUri(standalone.getUri());
      await expect(ping()).resolves.toBeUndefined();
      await standalone.stop({ doCleanup: true });
      stopped = true;
      const started = performance.now();
      await expect(ping(500)).rejects.toBeInstanceOf(DependencyUnavailableError);
      expect(performance.now() - started).toBeLessThan(1500);
    } finally {
      if (!stopped) await standalone.stop({ doCleanup: true });
    }
  });

  it("propagates ConfigError unchanged", async () => {
    await useDatabaseUri("not-a-mongodb-uri");
    await expect(ping()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("closeDb", () => {
  it("is idempotent and the next getDb reconnects", async () => {
    await getDb();
    await closeDb();
    await closeDb();
    await expect(ping()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration`
Expected: FAIL with `Failed to resolve import "@/modules/database"` (from the setup file and the test).

- [ ] **Step 7: Implement `client.ts`**

`src/modules/database/internal/client.ts`:
```ts
import { MongoClient, type Db, type MongoClientOptions } from "mongodb";
import { loadConfig, type AppConfig } from "@/modules/config";
import { ConfigError, DependencyUnavailableError, logger } from "@/modules/shared";

/** Every external call is bounded (architecture §5.2). */
const CLIENT_OPTIONS: MongoClientOptions = {
  appName: "ghostwire",
  serverSelectionTimeoutMS: 2000,
  connectTimeoutMS: 2000,
  socketTimeoutMS: 30_000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  retryWrites: true,
  retryReads: true,
};

interface ClientEntry {
  readonly mongo: MongoClient;
  readonly connected: Promise<MongoClient>;
}

/** Development only: survives Next dev hot reloads so pools are not leaked. */
const GLOBAL_KEY = Symbol.for("ghostwire.mongoClient");
const globalSlot = globalThis as unknown as Record<symbol, ClientEntry | undefined>;
let moduleEntry: ClientEntry | undefined;

function readEntry(): ClientEntry | undefined {
  return moduleEntry ?? globalSlot[GLOBAL_KEY];
}

function writeEntry(entry: ClientEntry | undefined, config?: AppConfig): void {
  moduleEntry = entry;
  if (entry === undefined || config?.NODE_ENV === "development") globalSlot[GLOBAL_KEY] = entry;
}

function createClient(uri: string): MongoClient {
  try {
    return new MongoClient(uri, CLIENT_OPTIONS);
  } catch {
    // The driver's parse error can echo the URI, so it is deliberately not attached as cause.
    throw new ConfigError([{ key: "MONGODB_URI", reason: "Rejected by the MongoDB driver" }]);
  }
}

async function connect(mongo: MongoClient): Promise<MongoClient> {
  try {
    return await mongo.connect();
  } catch (cause) {
    if (readEntry()?.mongo === mongo) writeEntry(undefined);
    await mongo.close().catch(() => undefined);
    throw new DependencyUnavailableError("database", { message: "MongoDB connection failed", cause });
  }
}

/**
 * Internal: the shared connected client. Concurrent callers share one connect; a failed connect
 * clears the cache so the next call retries.
 * @throws ConfigError, DependencyUnavailableError
 */
export async function getClient(): Promise<MongoClient> {
  const config = loadConfig();
  const existing = readEntry();
  if (existing !== undefined) return existing.connected;
  const mongo = createClient(config.MONGODB_URI);
  const entry: ClientEntry = { mongo, connected: connect(mongo) };
  writeEntry(entry, config);
  return entry.connected;
}

/** @throws DependencyUnavailableError (connect failed/timed out), ConfigError (invalid config) */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(loadConfig().MONGODB_DB_NAME);
}

/** Idempotent; never throws (close errors are logged at warn). */
export async function closeDb(): Promise<void> {
  const entry = readEntry();
  writeEntry(undefined);
  if (entry === undefined) return;
  try {
    await entry.mongo.close();
  } catch (error) {
    logger.warn("mongodb close failed", { err: error });
  }
}
```

- [ ] **Step 8: Implement `ping.ts`**

`src/modules/database/internal/ping.ts`:
```ts
import { ConfigError, DependencyUnavailableError } from "@/modules/shared";
import { getDb } from "./client";

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * Races a `ping` command against a timer. Does not retry (readiness is polled by the orchestrator).
 * @throws DependencyUnavailableError on any failure or timeout; ConfigError unchanged;
 *         RangeError if timeoutMs is outside [1, 30000].
 */
export async function ping(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be in [1, ${MAX_TIMEOUT_MS}]`);
  }
  const operation = getDb().then(async (db) => {
    await db.command({ ping: 1 });
  });
  // The losing promise must never surface as an unhandled rejection.
  operation.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new DependencyUnavailableError("database", { message: `ping timed out after ${timeoutMs}ms` }),
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof DependencyUnavailableError || error instanceof ConfigError) throw error;
    throw new DependencyUnavailableError("database", { message: "ping failed", cause: error });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 9: Create the public entry**

`src/modules/database/index.ts`:
```ts
export type { ClientSession, Db, Filter, ObjectId, Sort, WithId } from "mongodb";
export { closeDb, getDb } from "./internal/client";
export { ping } from "./internal/ping";
```

- [ ] **Step 10: Run the integration test to verify it passes**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration`
Expected: PASS, with `Tests  9 passed (9)`. A version-mismatch warning from mongodb-memory-server is acceptable. Any other warning must be investigated.

- [ ] **Step 11: Run everything, lint and typecheck**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test && bun run lint && bun run typecheck`
Expected: both projects pass, and lint and typecheck exit 0.

- [ ] **Step 12: Commit**

```bash
git add vitest.config.ts tests/setup tests/helpers tests/integration/database/ping.test.ts src/modules/database
git commit -m "feat(database): add cached client, getDb, ping and closeDb with replica-set test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `database`: bounded withTransaction

**Files:**
- Create: `src/modules/database/internal/errors.ts` (with `hasErrorLabelDeep`; Task 9 adds `mapMongoError`), `src/modules/database/internal/transaction.ts`
- Modify: `src/modules/database/index.ts` (full new contents below)
- Test: `tests/integration/database/transaction.test.ts`

**Interfaces:**
- Consumes: `getClient()` from `./client` (Task 7); `DependencyUnavailableError` and `logger` from `@/modules/shared`.
- Produces:
  - From `@/modules/database`: `interface WithTransactionOptions { readonly maxAttempts?: number }` and `withTransaction<T>(fn: (session: ClientSession) => Promise<T>, options?: WithTransactionOptions): Promise<T>`. It rejects with `RangeError` unless `maxAttempts` is an integer in [1, 10]. It rethrows non-retryable errors unchanged, and it throws `DependencyUnavailableError` (with `cause`) once labelled retries are exhausted.
  - Internal to `database`: `hasErrorLabelDeep(error: unknown, label: string): boolean`, which walks `cause` to depth 5.

- [ ] **Step 1: Write the failing test**

`tests/integration/database/transaction.test.ts`:
```ts
import { ClientSession, MongoError } from "mongodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, withTransaction } from "@/modules/database";
import { ConflictError, DependencyUnavailableError } from "@/modules/shared";

const COLLECTION = "txn_probe";
const TRANSIENT = "TransientTransactionError";
const UNKNOWN_COMMIT = "UnknownTransactionCommitResult";

function labelled(label: string): MongoError {
  const error = new MongoError("simulated");
  error.addErrorLabel(label);
  return error;
}

async function probe() {
  return (await getDb()).collection<{ ref: string }>(COLLECTION);
}

beforeAll(async () => {
  // Create the collection outside any transaction (no catalog changes inside one).
  await (await getDb()).createCollection(COLLECTION);
});

beforeEach(async () => {
  await (await probe()).deleteMany({});
});

describe("withTransaction", () => {
  it("commits and returns fn's result", async () => {
    const coll = await probe();
    const result = await withTransaction(async (session) => {
      await coll.insertOne({ ref: "a" }, { session });
      return "done";
    });
    expect(result).toBe("done");
    expect(await coll.countDocuments({ ref: "a" })).toBe(1);
  });

  it("rolls back and rethrows the same error instance without retrying", async () => {
    const coll = await probe();
    const boom = new Error("boom");
    let calls = 0;
    const outcome = withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "b" }, { session });
      throw boom;
    });
    await expect(outcome).rejects.toBe(boom);
    expect(calls).toBe(1);
    expect(await coll.countDocuments({})).toBe(0);
  });

  it("re-runs fn after a TransientTransactionError and discards the failed attempt", async () => {
    const coll = await probe();
    let calls = 0;
    const result = await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: `attempt-${calls}` }, { session });
      if (calls === 1) throw labelled(TRANSIENT);
      return calls;
    });
    expect(result).toBe(2);
    expect(calls).toBe(2);
    expect(await coll.find({}).map((d) => d.ref).toArray()).toEqual(["attempt-2"]);
  });

  it("throws DependencyUnavailableError with the labelled cause once attempts are exhausted", async () => {
    const transient = labelled(TRANSIENT);
    let calls = 0;
    const error: unknown = await withTransaction(async () => {
      calls += 1;
      throw transient;
    }).catch((e: unknown) => e);
    expect(calls).toBe(3);
    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as DependencyUnavailableError).cause).toBe(transient);
  });

  it("honours maxAttempts", async () => {
    let calls = 0;
    const outcome = withTransaction(
      async () => {
        calls += 1;
        throw labelled(TRANSIENT);
      },
      { maxAttempts: 1 },
    );
    await expect(outcome).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(calls).toBe(1);
  });

  it("detects the label on a wrapped cause", async () => {
    let calls = 0;
    const result = await withTransaction(async () => {
      calls += 1;
      if (calls === 1) throw new ConflictError({ cause: labelled(TRANSIENT) });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry a plain Error or an unlabelled MongoError", async () => {
    for (const thrown of [new Error("plain"), new MongoError("unlabelled")]) {
      let calls = 0;
      const outcome = withTransaction(async () => {
        calls += 1;
        throw thrown;
      });
      await expect(outcome).rejects.toBe(thrown);
      expect(calls).toBe(1);
    }
  });

  it("retries only the commit on UnknownTransactionCommitResult", async () => {
    const coll = await probe();
    const commit = vi
      .spyOn(ClientSession.prototype, "commitTransaction")
      .mockImplementationOnce(async () => {
        throw labelled(UNKNOWN_COMMIT);
      });
    let calls = 0;
    await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "c" }, { session });
    });
    expect(calls).toBe(1);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(await coll.countDocuments({ ref: "c" })).toBe(1);
  });

  it("re-runs fn when the commit fails with TransientTransactionError", async () => {
    const coll = await probe();
    vi.spyOn(ClientSession.prototype, "commitTransaction").mockImplementationOnce(async () => {
      throw labelled(TRANSIENT);
    });
    let calls = 0;
    await withTransaction(async (session) => {
      calls += 1;
      await coll.insertOne({ ref: "d" }, { session });
    });
    expect(calls).toBe(2);
    expect(await coll.countDocuments({ ref: "d" })).toBe(1);
  });

  it("rejects an invalid maxAttempts with RangeError before running fn", async () => {
    for (const maxAttempts of [0, 11, 1.5]) {
      let calls = 0;
      const outcome = withTransaction(
        async () => {
          calls += 1;
        },
        { maxAttempts },
      );
      await expect(outcome).rejects.toBeInstanceOf(RangeError);
      expect(calls).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration -- tests/integration/database/transaction.test.ts`
Expected: FAIL. `withTransaction` is not exported (`TypeError: withTransaction is not a function`).

- [ ] **Step 3: Implement `errors.ts`**

`src/modules/database/internal/errors.ts`:
```ts
import { MongoError } from "mongodb";

const MAX_CAUSE_DEPTH = 5;

/**
 * True if `error` or any link in its `cause` chain (up to depth 5) is a MongoError carrying `label`.
 * The walk matters because typedCollection wraps driver errors in AppErrors with the driver error as cause.
 */
export function hasErrorLabelDeep(error: unknown, label: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (current instanceof MongoError && current.hasErrorLabel(label)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
```

- [ ] **Step 4: Implement `transaction.ts`**

`src/modules/database/internal/transaction.ts`:
```ts
import type { ClientSession, TransactionOptions } from "mongodb";
import { DependencyUnavailableError, logger } from "@/modules/shared";
import { getClient } from "./client";
import { hasErrorLabelDeep } from "./errors";

export interface WithTransactionOptions {
  /** Default 3; integer in [1, 10]. Shared by fn re-runs and commit retries. */
  readonly maxAttempts?: number;
}

const TRANSIENT = "TransientTransactionError";
const UNKNOWN_COMMIT = "UnknownTransactionCommitResult";
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS_LIMIT = 10;

const TRANSACTION_OPTIONS: TransactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
  readPreference: "primary",
};

interface AttemptCounter {
  value: number;
}

/**
 * Runs `fn` in a transaction with bounded, label-driven retries. This deliberately does not use
 * the driver's session.withTransaction, which retries for up to 120 s with no count bound.
 *
 * Contract for `fn`: it may run up to `maxAttempts` times. It must only perform database
 * operations that pass `session`, and it must have no external side effects (HTTP, chain
 * submission, email).
 *
 * @throws whatever fn throws (non-retryable, unchanged); DependencyUnavailableError when labelled
 *         retries are exhausted; RangeError for an invalid maxAttempts.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  options: WithTransactionOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS_LIMIT) {
    throw new RangeError(`maxAttempts must be an integer in [1, ${MAX_ATTEMPTS_LIMIT}]`);
  }

  const client = await getClient();
  const session = client.startSession();
  const attempt: AttemptCounter = { value: 1 };
  try {
    for (;;) {
      session.startTransaction(TRANSACTION_OPTIONS);
      let result: T;
      try {
        result = await fn(session);
      } catch (error) {
        await abortQuietly(session);
        if (!hasErrorLabelDeep(error, TRANSIENT)) throw error;
        if (attempt.value >= maxAttempts) throw exhausted(error);
        await backoff(attempt.value);
        attempt.value += 1;
        continue;
      }
      if ((await commit(session, attempt, maxAttempts)) === "committed") return result;
    }
  } finally {
    await session.endSession();
  }
}

/** Commits, retrying only the commit on UnknownTransactionCommitResult (never re-running fn). */
async function commit(
  session: ClientSession,
  attempt: AttemptCounter,
  maxAttempts: number,
): Promise<"committed" | "rerun"> {
  for (;;) {
    try {
      await session.commitTransaction();
      return "committed";
    } catch (error) {
      if (hasErrorLabelDeep(error, UNKNOWN_COMMIT)) {
        if (attempt.value >= maxAttempts) throw exhausted(error);
        attempt.value += 1;
        await backoff(attempt.value);
        continue;
      }
      await abortQuietly(session);
      if (hasErrorLabelDeep(error, TRANSIENT)) {
        if (attempt.value >= maxAttempts) throw exhausted(error);
        await backoff(attempt.value);
        attempt.value += 1;
        return "rerun";
      }
      throw error;
    }
  }
}

async function abortQuietly(session: ClientSession): Promise<void> {
  if (!session.inTransaction()) return;
  try {
    await session.abortTransaction();
  } catch (error) {
    logger.warn("transaction abort failed", { err: error });
  }
}

function exhausted(cause: unknown): DependencyUnavailableError {
  return new DependencyUnavailableError("database", {
    message: "transaction retries exhausted",
    cause,
  });
}

/** Full jitter: random(0, min(250, 10 * 2^attempt)) ms, i.e. at most 20, 40 and 80 ms for attempts 1-3. */
function backoff(attempt: number): Promise<void> {
  const ceiling = Math.min(250, 10 * 2 ** attempt);
  const delay = Math.floor(Math.random() * ceiling);
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}
```

- [ ] **Step 5: Replace `src/modules/database/index.ts` with the full new contents**

```ts
export type { ClientSession, Db, Filter, ObjectId, Sort, WithId } from "mongodb";
export { closeDb, getDb } from "./internal/client";
export { ping } from "./internal/ping";
export { withTransaction } from "./internal/transaction";
export type { WithTransactionOptions } from "./internal/transaction";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration -- tests/integration/database/transaction.test.ts`
Expected: PASS, with `Tests  10 passed (10)`.

- [ ] **Step 7: Run everything, lint and typecheck**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test && bun run lint && bun run typecheck`
Expected: every test passes and both checks exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/modules/database tests/integration/database/transaction.test.ts
git commit -m "feat(database): add withTransaction with label-based bounded retry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: `database`: index registry, ensureIndexes and typedCollection

**Files:**
- Modify: `src/modules/database/internal/errors.ts` (full new contents below, adding `mapMongoError`)
- Create: `src/modules/database/internal/names.ts`, `src/modules/database/internal/indexes.ts`, `src/modules/database/internal/typed-collection.ts`
- Modify: `src/modules/database/index.ts` (full new contents below)
- Test: `tests/integration/database/indexes.test.ts`, `tests/integration/database/typed-collection.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `./client` (Task 7); `hasErrorLabelDeep` from `./errors` (Task 8); `withTransaction` (Task 8, used in tests); `ConflictError`, `DependencyUnavailableError`, `InternalError` and `ValidationError` from `@/modules/shared`.
- Produces (from `@/modules/database`):
  - `type IndexDirection = 1 | -1`
  - `interface IndexSpec { readonly name: string; readonly key: Readonly<Record<string, IndexDirection>>; readonly unique?: boolean; readonly sparse?: boolean; readonly expireAfterSeconds?: number; readonly partialFilterExpression?: Readonly<Record<string, unknown>> }`
  - `registerIndexes(collection: string, specs: readonly IndexSpec[]): void`. It throws `InternalError` with code `INDEX_REGISTRY_CONFLICT` when a name is re-registered with a different spec, `INDEX_SPEC_INVALID` for a bad index name, key or TTL, and `COLLECTION_NAME_INVALID` for a bad collection name. Registration is all-or-nothing per call.
  - `ensureIndexes(): Promise<void>`. It is idempotent. It throws `InternalError` with code `INDEX_CONFLICT` on server codes 85 or 86, and `DependencyUnavailableError` on connectivity failure.
  - `resetIndexRegistryForTests(): void`
  - `interface TypedCollection<S extends z.ZodObject> { name; insertOne(doc: z.input<S>, options?: { session?: ClientSession }): Promise<WithId<z.output<S>>>; findOne(filter: Filter<z.output<S>>, options?: { session?: ClientSession }): Promise<WithId<z.output<S>> | null>; find(filter: Filter<z.output<S>>, options: { limit: number; sort?: Sort; session?: ClientSession }): Promise<WithId<z.output<S>>[]> }`
  - `typedCollection<S extends z.ZodObject>(name: string, schema: S): TypedCollection<S>`. It is synchronous. It throws `InternalError("COLLECTION_NAME_INVALID")` unless the name matches `/^[a-z][a-z0-9_]{0,62}$/`. `insertOne` throws `ValidationError("DOCUMENT_INVALID")` or `ConflictError("DUPLICATE_KEY")`. Reads throw `InternalError("DATA_INTEGRITY")` on schema drift. `find` throws `RangeError` unless `limit` is an integer in [1, 1000].
- Internal to `database`: `mapMongoError(error: unknown): unknown` and `assertCollectionName(name: string): void`.

- [ ] **Step 1: Write the failing index tests**

`tests/integration/database/indexes.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureIndexes,
  getDb,
  registerIndexes,
  resetIndexRegistryForTests,
  type IndexSpec,
} from "@/modules/database";
import { InternalError } from "@/modules/shared";

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

const BY_REF: IndexSpec = { name: "by_ref_unique", key: { ref: 1 }, unique: true };

beforeEach(() => {
  resetIndexRegistryForTests();
});

describe("registerIndexes", () => {
  it("is a no-op when the identical spec is registered again", () => {
    registerIndexes("index_probe", [BY_REF]);
    expect(() => registerIndexes("index_probe", [{ ...BY_REF, key: { ref: 1 } }])).not.toThrow();
  });

  it("throws INDEX_REGISTRY_CONFLICT when a name is re-registered with a different spec", () => {
    registerIndexes("index_probe", [BY_REF]);
    const error = thrownBy(() => registerIndexes("index_probe", [{ ...BY_REF, key: { other: 1 } }]));
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe("INDEX_REGISTRY_CONFLICT");
  });

  it.each([
    { label: "collection name", collection: "BadName", spec: BY_REF, code: "COLLECTION_NAME_INVALID" },
    { label: "index name", collection: "index_probe", spec: { ...BY_REF, name: "has space" }, code: "INDEX_SPEC_INVALID" },
    { label: "empty key", collection: "index_probe", spec: { ...BY_REF, key: {} }, code: "INDEX_SPEC_INVALID" },
    {
      label: "direction",
      collection: "index_probe",
      spec: { ...BY_REF, key: { ref: 2 as unknown as 1 } },
      code: "INDEX_SPEC_INVALID",
    },
    {
      label: "TTL",
      collection: "index_probe",
      spec: { ...BY_REF, expireAfterSeconds: -1 },
      code: "INDEX_SPEC_INVALID",
    },
  ])("rejects an invalid $label with $code", ({ collection, spec, code }) => {
    const error = thrownBy(() => registerIndexes(collection, [spec]));
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe(code);
  });

  it("registers nothing when any spec in the call is invalid", async () => {
    expect(() =>
      registerIndexes("atomic_probe", [BY_REF, { ...BY_REF, name: "bad name" }]),
    ).toThrow(InternalError);
    await ensureIndexes();
    const db = await getDb();
    expect(await db.listCollections({ name: "atomic_probe" }).toArray()).toEqual([]);
  });
});

describe("ensureIndexes", () => {
  it("creates every registered index and is idempotent", async () => {
    registerIndexes("index_probe", [BY_REF]);
    await ensureIndexes();
    await ensureIndexes();
    const indexes = await (await getDb()).collection("index_probe").indexes();
    const byRef = indexes.filter((i) => i.name === "by_ref_unique");
    expect(byRef).toHaveLength(1);
    expect(byRef[0]?.unique).toBe(true);
    expect(byRef[0]?.key).toEqual({ ref: 1 });
  });

  it("throws INDEX_CONFLICT when the server holds a different index under the same name", async () => {
    registerIndexes("index_conflict_probe", [{ name: "by_ref", key: { ref: 1 } }]);
    await ensureIndexes();
    resetIndexRegistryForTests();
    registerIndexes("index_conflict_probe", [{ name: "by_ref", key: { ref: -1 } }]);
    const error: unknown = await ensureIndexes().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalError);
    expect((error as InternalError).code).toBe("INDEX_CONFLICT");
  });

  it("resolves when nothing is registered", async () => {
    await expect(ensureIndexes()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the failing typedCollection tests**

`tests/integration/database/typed-collection.test.ts`:
```ts
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { z } from "zod";
import { getDb, typedCollection, withTransaction } from "@/modules/database";
import {
  ConflictError,
  DependencyUnavailableError,
  InternalError,
  ValidationError,
} from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const COLLECTION = "typed_probe";
const strictSchema = z.strictObject({ ref: z.string().min(1), amount: z.string() });

async function raw() {
  return (await getDb()).collection(COLLECTION);
}

beforeAll(async () => {
  await (await getDb()).createCollection(COLLECTION);
});

beforeEach(async () => {
  await (await raw()).deleteMany({});
});

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("typedCollection", () => {
  it("rejects invalid documents with DOCUMENT_INVALID and writes nothing", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const error: unknown = await probes.insertOne({ ref: "", amount: "1" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("DOCUMENT_INVALID");
    expect((error as ValidationError).safeMessage).toBe("Invalid document");
    expect(await (await raw()).countDocuments({})).toBe(0);
  });

  it("names the collection and failing paths but not the values", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const error = (await probes
      .insertOne({ ref: "SENTINEL-REF", amount: 5 as unknown as string })
      .catch((e: unknown) => e)) as ValidationError;
    expect(error.message).toContain(COLLECTION);
    expect(error.message).toContain("amount");
    expect(error.message).not.toContain("SENTINEL-REF");
  });

  it("rejects unknown keys with a strict schema", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const doc = { ref: "a", amount: "1", extra: true };
    await expect(probes.insertOne(doc)).rejects.toBeInstanceOf(ValidationError);
  });

  it("inserts the parsed output and reads it back parsed", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    const inserted = await probes.insertOne({ ref: "a", amount: "100" });
    expect(inserted).toMatchObject({ ref: "a", amount: "100" });
    expect(inserted._id).toBeDefined();
    expect(await probes.findOne({ ref: "a" })).toEqual(inserted);
  });

  it("strips unknown keys with a non-strict schema", async () => {
    const loose = typedCollection(COLLECTION, z.object({ ref: z.string() }));
    const doc = { ref: "s", junk: "x" };
    await loose.insertOne(doc);
    const stored = await (await raw()).findOne({ ref: "s" });
    expect(stored).not.toHaveProperty("junk");
  });

  it("returns null from findOne when nothing matches", async () => {
    expect(await typedCollection(COLLECTION, strictSchema).findOne({ ref: "missing" })).toBeNull();
  });

  it("find is bounded, sorted and requires a limit in [1, 1000]", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    for (const ref of ["b", "a", "c"]) await probes.insertOne({ ref, amount: "1" });
    const found = await probes.find({}, { limit: 2, sort: { ref: 1 } });
    expect(found.map((d) => d.ref)).toEqual(["a", "b"]);
    for (const limit of [0, 1001, 1.5]) {
      await expect(probes.find({}, { limit })).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("reports stored documents that fail the schema as DATA_INTEGRITY", async () => {
    await (await raw()).insertOne({ ref: 5, amount: "1" });
    const probes = typedCollection(COLLECTION, strictSchema);
    for (const read of [() => probes.findOne({}), () => probes.find({}, { limit: 10 })]) {
      const error: unknown = await read().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InternalError);
      expect((error as InternalError).code).toBe("DATA_INTEGRITY");
    }
  });

  it("maps a duplicate key to ConflictError DUPLICATE_KEY", async () => {
    const db = await getDb();
    await db.collection("dup_probe").createIndex({ ref: 1 }, { unique: true, name: "dup_ref_unique" });
    const dups = typedCollection("dup_probe", strictSchema);
    await dups.insertOne({ ref: "same", amount: "1" });
    const error: unknown = await dups.insertOne({ ref: "same", amount: "2" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe("DUPLICATE_KEY");
    expect((error as ConflictError).safeMessage).toBe("Resource already exists");
  });

  it("honours the session so a failed transaction persists nothing", async () => {
    const probes = typedCollection(COLLECTION, strictSchema);
    await expect(
      withTransaction(async (session) => {
        await probes.insertOne({ ref: "t", amount: "1" }, { session });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await probes.findOne({ ref: "t" })).toBeNull();
  });

  it("rejects an invalid collection name synchronously", () => {
    expect(() => typedCollection("BadName", strictSchema)).toThrow(InternalError);
  });

  it("maps an unreachable server to DependencyUnavailableError", async () => {
    const standalone = await startStandalone();
    let stopped = false;
    try {
      await useDatabaseUri(standalone.getUri());
      const probes = typedCollection(COLLECTION, strictSchema);
      await probes.insertOne({ ref: "x", amount: "1" });
      await standalone.stop({ doCleanup: true });
      stopped = true;
      await expect(probes.findOne({ ref: "x" })).rejects.toBeInstanceOf(DependencyUnavailableError);
    } finally {
      if (!stopped) await standalone.stop({ doCleanup: true });
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration -- tests/integration/database/indexes.test.ts tests/integration/database/typed-collection.test.ts`
Expected: FAIL. `registerIndexes`, `resetIndexRegistryForTests` and `typedCollection` are not exported (`TypeError: ... is not a function`).

- [ ] **Step 4: Replace `src/modules/database/internal/errors.ts` with the full new contents**

```ts
import {
  MongoError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from "mongodb";
import { ConflictError, DependencyUnavailableError } from "@/modules/shared";

const MAX_CAUSE_DEPTH = 5;
const DUPLICATE_KEY_CODE = 11000;

/**
 * True if `error` or any link in its `cause` chain (up to depth 5) is a MongoError carrying `label`.
 * The walk matters because typedCollection wraps driver errors in AppErrors with the driver error as cause.
 */
export function hasErrorLabelDeep(error: unknown, label: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (current instanceof MongoError && current.hasErrorLabel(label)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/**
 * Connectivity -> DependencyUnavailableError; duplicate key -> ConflictError("DUPLICATE_KEY");
 * anything else is returned unchanged. The driver error is always kept as `cause`, so
 * transaction labels survive the mapping.
 */
export function mapMongoError(error: unknown): unknown {
  if (
    error instanceof MongoServerSelectionError ||
    error instanceof MongoNetworkError ||
    error instanceof MongoTopologyClosedError ||
    error instanceof MongoNotConnectedError
  ) {
    return new DependencyUnavailableError("database", {
      message: "MongoDB operation failed: database unreachable",
      cause: error,
    });
  }
  if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
    return new ConflictError({
      code: "DUPLICATE_KEY",
      safeMessage: "Resource already exists",
      cause: error,
    });
  }
  return error;
}
```

- [ ] **Step 5: Implement `names.ts`**

`src/modules/database/internal/names.ts`:
```ts
import { InternalError } from "@/modules/shared";

/** snake_case collection names, per docs/DATA_MODEL.md. */
const COLLECTION_NAME = /^[a-z][a-z0-9_]{0,62}$/;

export function assertCollectionName(name: string): void {
  if (!COLLECTION_NAME.test(name)) {
    throw new InternalError({
      code: "COLLECTION_NAME_INVALID",
      message: `invalid collection name ${JSON.stringify(name)}; expected ${COLLECTION_NAME.source}`,
    });
  }
}
```

- [ ] **Step 6: Implement `indexes.ts`**

`src/modules/database/internal/indexes.ts`:
```ts
import { MongoServerError, type IndexDescription } from "mongodb";
import { InternalError } from "@/modules/shared";
import { getDb } from "./client";
import { mapMongoError } from "./errors";
import { assertCollectionName } from "./names";

export type IndexDirection = 1 | -1;

export interface IndexSpec {
  /** /^[A-Za-z0-9_]{1,64}$/, unique per collection. */
  readonly name: string;
  /** At least one field; insertion order is the index key order. */
  readonly key: Readonly<Record<string, IndexDirection>>;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  /** Integer >= 0. */
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
}

const INDEX_NAME = /^[A-Za-z0-9_]{1,64}$/;
const DIRECTIONS = new Set<unknown>([1, -1]);
/** IndexOptionsConflict (85) and IndexKeySpecsConflict (86). */
const INDEX_CONFLICT_CODES = new Set<unknown>([85, 86]);

const registry = new Map<string, Map<string, IndexSpec>>();

function invalid(collection: string, detail: string): InternalError {
  return new InternalError({ code: "INDEX_SPEC_INVALID", message: `${collection}: ${detail}` });
}

function validateSpec(collection: string, spec: IndexSpec): void {
  if (!INDEX_NAME.test(spec.name)) {
    throw invalid(collection, `invalid index name ${JSON.stringify(spec.name)}`);
  }
  const fields = Object.entries(spec.key);
  if (fields.length === 0) throw invalid(collection, `index ${spec.name} has no key fields`);
  if (fields.some(([, direction]) => !DIRECTIONS.has(direction))) {
    throw invalid(collection, `index ${spec.name} directions must be 1 or -1`);
  }
  const ttl = spec.expireAfterSeconds;
  if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 0)) {
    throw invalid(collection, `index ${spec.name} expireAfterSeconds must be an integer >= 0`);
  }
}

/** Order-sensitive for `key` (index key order matters); identical source literals always match. */
function fingerprint(spec: IndexSpec): string {
  return JSON.stringify([
    Object.entries(spec.key),
    spec.unique ?? false,
    spec.sparse ?? false,
    spec.expireAfterSeconds ?? null,
    spec.partialFilterExpression ?? null,
  ]);
}

/**
 * All-or-nothing per call. Re-registering an identical spec is a no-op (safe under HMR).
 * @throws InternalError INDEX_REGISTRY_CONFLICT | INDEX_SPEC_INVALID | COLLECTION_NAME_INVALID
 */
export function registerIndexes(collection: string, specs: readonly IndexSpec[]): void {
  assertCollectionName(collection);
  const current = registry.get(collection) ?? new Map<string, IndexSpec>();
  const pending = new Map<string, IndexSpec>();
  for (const spec of specs) {
    validateSpec(collection, spec);
    const prior = pending.get(spec.name) ?? current.get(spec.name);
    if (prior !== undefined && fingerprint(prior) !== fingerprint(spec)) {
      throw new InternalError({
        code: "INDEX_REGISTRY_CONFLICT",
        message: `${collection}.${spec.name} is already registered with a different spec`,
      });
    }
    pending.set(spec.name, Object.freeze({ ...spec, key: Object.freeze({ ...spec.key }) }));
  }
  if (pending.size === 0) return;
  for (const [name, spec] of pending) current.set(name, spec);
  registry.set(collection, current);
}

function toIndexDescription(spec: IndexSpec): IndexDescription {
  return {
    name: spec.name,
    key: { ...spec.key },
    ...(spec.unique === undefined ? {} : { unique: spec.unique }),
    ...(spec.sparse === undefined ? {} : { sparse: spec.sparse }),
    ...(spec.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: spec.expireAfterSeconds }),
    ...(spec.partialFilterExpression === undefined
      ? {}
      : { partialFilterExpression: { ...spec.partialFilterExpression } }),
  };
}

/**
 * Creates every registered index. Names are explicit, so a second run is a server no-op.
 * Not called by application code in this PR. The first PR that adds a collection picks the call site.
 * @throws InternalError("INDEX_CONFLICT") on server codes 85/86; DependencyUnavailableError on connectivity
 */
export async function ensureIndexes(): Promise<void> {
  if (registry.size === 0) return;
  const db = await getDb();
  for (const [collection, specs] of registry) {
    try {
      await db.collection(collection).createIndexes([...specs.values()].map(toIndexDescription));
    } catch (error) {
      if (error instanceof MongoServerError && INDEX_CONFLICT_CODES.has(error.code)) {
        throw new InternalError({
          code: "INDEX_CONFLICT",
          message: `${collection}: an existing index conflicts with the registered spec; write an index migration`,
          cause: error,
        });
      }
      throw mapMongoError(error);
    }
  }
}

export function resetIndexRegistryForTests(): void {
  registry.clear();
}
```

- [ ] **Step 7: Implement `typed-collection.ts`**

`src/modules/database/internal/typed-collection.ts`:
```ts
import type { ClientSession, Document, Filter, Sort, WithId } from "mongodb";
import type { z } from "zod";
import { InternalError, ValidationError } from "@/modules/shared";
import { getDb } from "./client";
import { mapMongoError } from "./errors";
import { assertCollectionName } from "./names";

const MAX_FIND_LIMIT = 1000;

export interface TypedCollection<S extends z.ZodObject> {
  readonly name: string;
  /** @throws ValidationError("DOCUMENT_INVALID"), ConflictError("DUPLICATE_KEY"), DependencyUnavailableError */
  insertOne(doc: z.input<S>, options?: { session?: ClientSession }): Promise<WithId<z.output<S>>>;
  /** @throws InternalError("DATA_INTEGRITY") if a stored doc fails the schema; DependencyUnavailableError */
  findOne(
    filter: Filter<z.output<S>>,
    options?: { session?: ClientSession },
  ): Promise<WithId<z.output<S>> | null>;
  /** limit is required, integer in [1, 1000] (no unbounded reads). Same throws as findOne, plus RangeError. */
  find(
    filter: Filter<z.output<S>>,
    options: { limit: number; sort?: Sort; session?: ClientSession },
  ): Promise<WithId<z.output<S>>[]>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function asDocumentFilter(filter: unknown): Filter<Document> {
  return filter as Filter<Document>;
}

function issuePaths(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".")))
    .join(", ");
}

/**
 * The Zod schema is the single source of truth for the document shape, excluding `_id` (schemas
 * must not declare `_id`). Writes store the parsed output; reads are parsed. Sync, no I/O.
 * @throws InternalError("COLLECTION_NAME_INVALID")
 */
export function typedCollection<S extends z.ZodObject>(name: string, schema: S): TypedCollection<S> {
  assertCollectionName(name);
  type Stored = WithId<z.output<S>>;

  async function collection() {
    return (await getDb()).collection<Document>(name);
  }

  function parseStored(doc: WithId<Document>): Stored {
    const { _id, ...rest } = doc;
    const parsed = schema.safeParse(rest);
    if (!parsed.success) {
      throw new InternalError({
        code: "DATA_INTEGRITY",
        message: `${name}: stored document failed schema validation at ${issuePaths(parsed.error)}`,
        cause: parsed.error,
      });
    }
    return { _id, ...asRecord(parsed.data) } as unknown as Stored;
  }

  return {
    name,

    async insertOne(doc, options = {}) {
      const parsed = schema.safeParse(doc);
      if (!parsed.success) {
        throw new ValidationError({
          code: "DOCUMENT_INVALID",
          safeMessage: "Invalid document",
          message: `${name}: ${issuePaths(parsed.error)}`,
          cause: parsed.error,
        });
      }
      const data = asRecord(parsed.data);
      try {
        // Copy: the driver mutates the inserted object to add _id.
        const { insertedId } = await (await collection()).insertOne(
          { ...data },
          { session: options.session },
        );
        return { _id: insertedId, ...data } as unknown as Stored;
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async findOne(filter, options = {}) {
      try {
        const doc = await (await collection()).findOne(asDocumentFilter(filter), {
          session: options.session,
        });
        return doc === null ? null : parseStored(doc);
      } catch (error) {
        throw mapMongoError(error);
      }
    },

    async find(filter, options) {
      const { limit, sort, session } = options;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FIND_LIMIT) {
        throw new RangeError(`limit must be an integer in [1, ${MAX_FIND_LIMIT}]`);
      }
      try {
        const cursor = (await collection()).find(asDocumentFilter(filter), { limit, session });
        const docs = await (sort === undefined ? cursor : cursor.sort(sort)).toArray();
        return docs.map((doc) => parseStored(doc));
      } catch (error) {
        throw mapMongoError(error);
      }
    },
  };
}
```

- [ ] **Step 8: Replace `src/modules/database/index.ts` with the full new contents**

```ts
export type { ClientSession, Db, Filter, ObjectId, Sort, WithId } from "mongodb";
export { closeDb, getDb } from "./internal/client";
export { ping } from "./internal/ping";
export { withTransaction } from "./internal/transaction";
export type { WithTransactionOptions } from "./internal/transaction";
export { ensureIndexes, registerIndexes, resetIndexRegistryForTests } from "./internal/indexes";
export type { IndexDirection, IndexSpec } from "./internal/indexes";
export { typedCollection } from "./internal/typed-collection";
export type { TypedCollection } from "./internal/typed-collection";
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:integration -- tests/integration/database/indexes.test.ts tests/integration/database/typed-collection.test.ts`
Expected: PASS, with `Tests  23 passed (23)` (11 index tests and 12 typedCollection tests).

- [ ] **Step 10: Run everything, lint and typecheck**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test && bun run lint && bun run typecheck`
Expected: every test passes and both checks exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/modules/database tests/integration/database/indexes.test.ts tests/integration/database/typed-collection.test.ts
git commit -m "feat(database): add index registry, ensureIndexes and Zod-typed collections" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Routes `/api/health` and `/api/ready`, and boot-time instrumentation

**Files:**
- Create: `src/app/api/health/route.ts`, `src/app/api/ready/route.ts`, `src/instrumentation.ts`
- Test: `tests/integration/routes/health.test.ts`, `tests/integration/routes/ready.test.ts`, `tests/unit/instrumentation.test.ts`

**Interfaces:**
- Consumes: `ping()` from `@/modules/database`; `noStoreJson` and `logger` from `@/modules/shared`; `loadConfig` from `@/modules/config`, loaded with a dynamic import in `instrumentation.ts`.
- Produces:
  - `src/app/api/health/route.ts`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `GET(_request: Request): Response`, which always returns `200 {"status":"ok"}`.
  - `src/app/api/ready/route.ts`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `GET(_request: Request): Promise<Response>`, which returns `200 {"status":"ready","checks":{"database":"up"}}` or `503 {"status":"unavailable","checks":{"database":"down"}}`.
  - `src/instrumentation.ts`: `register(): Promise<void>`. On the Node runtime outside `phase-production-build`, it calls `loadConfig()` and throws `ConfigError` on invalid config.

- [ ] **Step 1: Write the failing route tests**

`tests/integration/routes/health.test.ts`:
```ts
import { afterEach, describe, expect, inject, it } from "vitest";
import * as health from "@/app/api/health/route";
import { useDatabaseUri } from "../../helpers/mongo";

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("GET /api/health", () => {
  it("returns 200 {status: ok} with no-store", async () => {
    const res = health.GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("still returns 200 when the database configuration is broken", async () => {
    await useDatabaseUri("not-a-mongodb-uri");
    const res = health.GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("runs on the Node runtime and is always dynamic", () => {
    expect(health.runtime).toBe("nodejs");
    expect(health.dynamic).toBe("force-dynamic");
  });
});
```

`tests/integration/routes/ready.test.ts`:
```ts
import { afterEach, describe, expect, inject, it, vi } from "vitest";
import * as ready from "@/app/api/ready/route";
import { logger } from "@/modules/shared";
import { startStandalone, useDatabaseUri } from "../../helpers/mongo";

const DOWN_BODY = { status: "unavailable", checks: { database: "down" } };

async function stoppedUri(): Promise<string> {
  const standalone = await startStandalone();
  const uri = standalone.getUri();
  await standalone.stop({ doCleanup: true });
  return uri;
}

afterEach(async () => {
  await useDatabaseUri(inject("mongoUri"));
});

describe("GET /api/ready", () => {
  it("returns 200 ready when the database is up", async () => {
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ready", checks: { database: "up" } });
  });

  it("returns the fixed 503 body when the database is down and logs the cause server-side only", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await useDatabaseUri(await stoppedUri());
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual(DOWN_BODY);
    expect(text).not.toMatch(/Mongo|timed out|127\.0\.0\.1/);
    expect(warn).toHaveBeenCalledWith(
      "readiness check failed",
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it("returns the same fixed 503 body when configuration is invalid", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    await useDatabaseUri("not-a-mongodb-uri");
    const res = await ready.GET(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(DOWN_BODY);
  });

  it("runs on the Node runtime and is always dynamic", () => {
    expect(ready.runtime).toBe("nodejs");
    expect(ready.dynamic).toBe("force-dynamic");
  });
});
```

- [ ] **Step 2: Write the failing instrumentation test**

`tests/unit/instrumentation.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { resetConfigForTests } from "@/modules/config";
import { ConfigError, setLogLevel } from "@/modules/shared";

const VALID = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/?replicaSet=rs0",
  MONGODB_DB_NAME: "ghostwire_test",
  LOG_LEVEL: "error",
};

function stubEnv(env: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetConfigForTests();
}

afterEach(() => {
  resetConfigForTests();
  setLogLevel("info");
  vi.unstubAllEnvs();
});

describe("instrumentation register()", () => {
  it("skips config validation on the edge runtime", async () => {
    stubEnv({ NEXT_RUNTIME: "edge", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("skips config validation during the production build phase", async () => {
    stubEnv({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", MONGODB_URI: "" });
    await expect(register()).resolves.toBeUndefined();
  });

  it("fails fast with ConfigError on the Node runtime when config is invalid", async () => {
    stubEnv({ ...VALID, MONGODB_URI: "", NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-server" });
    await expect(register()).rejects.toBeInstanceOf(ConfigError);
  });

  it("loads config on the Node runtime when config is valid", async () => {
    stubEnv({ ...VALID, NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-server" });
    await expect(register()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test -- tests/integration/routes tests/unit/instrumentation.test.ts`
Expected: FAIL with `Failed to resolve import "@/app/api/health/route"`, the same for `.../ready/route`, and the same for `"@/instrumentation"`.

- [ ] **Step 4: Implement the health route**

`src/app/api/health/route.ts`:
```ts
import { noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: no dependency checks; it cannot fail because of the database or config. */
export function GET(_request: Request): Response {
  return noStoreJson({ status: "ok" }, { status: 200 });
}
```

- [ ] **Step 5: Implement the readiness route**

`src/app/api/ready/route.ts`:
```ts
import { ping } from "@/modules/database";
import { logger, noStoreJson } from "@/modules/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness: reflects MongoDB (<= 2 s via ping). Any failure, ConfigError included, is "not ready". */
export async function GET(_request: Request): Promise<Response> {
  try {
    await ping();
    return noStoreJson({ status: "ready", checks: { database: "up" } }, { status: 200 });
  } catch (error) {
    logger.warn("readiness check failed", { err: error });
    return noStoreJson({ status: "unavailable", checks: { database: "down" } }, { status: 503 });
  }
}
```

- [ ] **Step 6: Implement instrumentation**

`src/instrumentation.ts`:
```ts
/**
 * Fail fast on invalid config at server boot (`next start` / `next dev`). Skipped during
 * `next build`, so a fresh clone builds without a .env. Next runtime file: reading
 * process.env here is an allowed exception to the config-only rule.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { loadConfig } = await import("@/modules/config");
  loadConfig();
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test -- tests/integration/routes tests/unit/instrumentation.test.ts`
Expected: PASS, with `Tests  11 passed (11)` (3 health, 4 ready and 4 instrumentation).

- [ ] **Step 8: Run everything, lint, typecheck and build**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test && bun run lint && bun run typecheck && bun run build`
Expected: every test passes, and lint and typecheck exit 0. The build route table lists `ƒ /api/health` and `ƒ /api/ready` (dynamic) plus `/`. The build must succeed **without** a `.env` file. Confirm with `ls .env 2>/dev/null`, which should print nothing.

Smoke-check fail-fast boot: `NODE_ENV=production MONGODB_URI= MONGODB_DB_NAME= timeout 20 bun run start; echo "exit=$?"`
Expected: the server prints an error that contains `Invalid configuration: MONGODB_URI (Required); MONGODB_DB_NAME (Required)` and exits non-zero (`exit=` is not `0`, and not `124`, which would mean it stayed up). If Next 16 logs the instrumentation error but keeps serving (`exit=124`), record that behaviour in your task report for ADR-0002 and continue. The unit test above is the binding check.

- [ ] **Step 9: Commit**

```bash
git add src/app/api src/instrumentation.ts tests/integration/routes tests/unit/instrumentation.test.ts
git commit -m "feat(app): add /api/health, /api/ready and fail-fast config instrumentation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ESLint boundary rules, fixtures and placeholder modules

**Files:**
- Modify: `eslint.config.mjs` (full new contents below)
- Create: `src/modules/privacy/index.ts`, `src/modules/wallet/index.ts`, `src/modules/payments/index.ts`, `src/modules/blockchain/index.ts`, `src/modules/security/index.ts`
- Create: `tests/fixtures/lint/deep-import.ts`, `relative-escape.ts`, `module-imports-app.ts`, `mongodb-outside-database.ts`, `env-outside-config.ts`, `nested-internal.ts`, `allowed-database.ts`, `allowed-config.ts`
- Test: `tests/unit/lint/boundaries.test.ts`

**Interfaces:**
- Consumes: the base `eslint.config.mjs` from Task 1, and every source file from Tasks 1–10, which must lint clean under the new rules.
- Produces: the boundary scopes S1–S12 (architecture §4); `no-console: "error"` across `src/**`; and placeholder modules whose `index.ts` is exactly `export {};`.

- [ ] **Step 1: Create the lint fixtures**

These files sit under `tests/fixtures/**`, which is globally ignored by ESLint and excluded from `tsconfig`. They are only linted by the test, which uses virtual paths. Line numbers matter: each violation is on the line the test expects.

`tests/fixtures/lint/deep-import.ts`:
```ts
import { getClient } from "@/modules/database/internal/client";

export const probe = getClient;
```

`tests/fixtures/lint/relative-escape.ts`:
```ts
import { getClient } from "../../database/internal/client";

export const probe = getClient;
```

`tests/fixtures/lint/module-imports-app.ts`:
```ts
import Page from "@/app/page";

export const probe = Page;
```

`tests/fixtures/lint/mongodb-outside-database.ts`:
```ts
import { MongoClient } from "mongodb";

export async function probe(): Promise<unknown> {
  const driver = await import("mongodb");
  return [MongoClient, driver];
}
```

`tests/fixtures/lint/env-outside-config.ts`:
```ts
import { env as importedEnv } from "node:process";

export const direct = process.env.MONGODB_URI;
const { env } = process;
export const viaGlobal = globalThis.process.env.MONGODB_URI;
export const all = [importedEnv, env];
```

`tests/fixtures/lint/nested-internal.ts`:
```ts
export const nested = true;
```

`tests/fixtures/lint/allowed-database.ts`:
```ts
import { MongoClient } from "mongodb";
import { loadConfig } from "@/modules/config";

export const allowed = [MongoClient, loadConfig];
```

`tests/fixtures/lint/allowed-config.ts`:
```ts
export const uri = process.env.MONGODB_URI;
```

- [ ] **Step 2: Write the failing boundary test**

`tests/unit/lint/boundaries.test.ts`:
```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const BOUNDARY_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-restricted-properties",
]);

const MSG = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
  flat: "internal/ must be flat; no subdirectories.",
  none: "",
};

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: path.join(repoRoot, "eslint.config.mjs") });
});

async function boundaryMessages(fixture: string, virtualPath: string): Promise<Linter.LintMessage[]> {
  const code = await readFile(path.join(repoRoot, "tests/fixtures/lint", fixture), "utf8");
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, virtualPath) });
  if (result === undefined) throw new Error(`no lint result for ${fixture}`);
  expect(result.messages.filter((m) => m.fatal === true)).toEqual([]);
  return result.messages.filter((m) => m.ruleId !== null && BOUNDARY_RULES.has(m.ruleId));
}

describe("module boundary lint rules", { timeout: 60_000 }, () => {
  it.each([
    { fixture: "deep-import.ts", virtualPath: "src/app/__lint__/deep-import.ts", lines: [1], message: MSG.deep },
    {
      fixture: "relative-escape.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      lines: [1],
      message: MSG.escape,
    },
    {
      fixture: "module-imports-app.ts",
      virtualPath: "src/modules/shared/internal/__lint__.ts",
      lines: [1],
      message: MSG.app,
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/payments/internal/__lint__.ts",
      lines: [1, 4],
      message: MSG.mongodb,
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "tests/unit/__lint__.test.ts",
      lines: [1, 4],
      message: MSG.mongodb,
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      lines: [1, 3, 4, 5],
      message: MSG.env,
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/app/__lint__/env.ts",
      lines: [1, 3, 4, 5],
      message: MSG.env,
    },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/wallet/internal/sub/__lint__.ts",
      lines: [1],
      message: MSG.flat,
    },
    {
      fixture: "allowed-database.ts",
      virtualPath: "src/modules/database/internal/__lint__.ts",
      lines: [],
      message: MSG.none,
    },
    {
      fixture: "allowed-config.ts",
      virtualPath: "src/modules/config/internal/__lint__.ts",
      lines: [],
      message: MSG.none,
    },
    { fixture: "allowed-config.ts", virtualPath: "src/instrumentation.ts", lines: [], message: MSG.none },
  ])("$fixture linted as $virtualPath", async ({ fixture, virtualPath, lines, message }) => {
    const messages = await boundaryMessages(fixture, virtualPath);
    expect([...new Set(messages.map((m) => m.line))].sort((a, b) => a - b)).toEqual(lines);
    for (const m of messages) expect(m.message).toBe(message);
  });
});
```

The test checks the exact **set of violating lines** and the exact message text, rather than per-rule counts. One source line can legitimately trip two rules: `const { env } = process` is caught by both `no-restricted-properties` (destructuring) and the `no-restricted-syntax` selector. Only the lines must be exact.

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test:unit -- tests/unit/lint/boundaries.test.ts`
Expected: FAIL. Every case that expects violations reports `expected [] to deeply equal [1]` (or similar), because the base config has no boundary rules yet. The three "allowed" cases already pass.

- [ ] **Step 4: Replace `eslint.config.mjs` with the full new contents**

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** Unused identifiers are errors; a leading underscore marks an intentionally unused one. */
const unusedVars = {
  files: ["**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Module boundary rules (spec §4, architecture §4).
// PITFALL: in flat config a later object that sets the same rule REPLACES it (no merge).
// So every scope below emits exactly one composed entry per rule, and scopes use disjoint
// files/ignores globs. Never add a second object that sets these rules for overlapping files.
// ---------------------------------------------------------------------------

const MESSAGES = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  relIntoModules: "Use '@/modules/<name>', not relative paths into src/modules.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  flatInternal: "internal/ must be flat; no subdirectories.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
};

/** R1: no deep imports into a module. */
const R1_DEEP = { patterns: [{ regex: "^@/modules/[^/]+/.+", message: MESSAGES.deep }] };
/** R1: no relative paths into src/modules from outside. */
const R1_REL_INTO_MODULES = {
  patterns: [{ regex: "^\\.{1,2}/(.+/)?modules/", message: MESSAGES.relIntoModules }],
};
/** R1: files at a module root may not climb out with ../ */
const R1_ESCAPE_1 = { patterns: [{ regex: "^\\.\\./", message: MESSAGES.escape }] };
/** R1: files in module/internal may not climb out with ../../ */
const R1_ESCAPE_2 = { patterns: [{ regex: "^\\.\\./\\.\\./", message: MESSAGES.escape }] };
/** R1: internal/ is flat. Any file in a subdirectory is an error. */
const R1_FLAT_INTERNAL = { syntax: [{ selector: "Program", message: MESSAGES.flatInternal }] };
/** R2: modules never import the app layer. */
const R2_APP = { patterns: [{ regex: "^@/app(/|$)", message: MESSAGES.app }] };
/** R3: only database imports mongodb/bson (static, type-only, re-export and dynamic import). */
const R3_MONGODB = {
  patterns: [{ regex: "^(mongodb|bson)(/|$)", message: MESSAGES.mongodb }],
  // esquery regex literals cannot contain "/", so the slash is written as \x2F.
  syntax: [
    {
      selector: "ImportExpression[source.value=/^(mongodb|bson)(\\x2F|$)/]",
      message: MESSAGES.mongodb,
    },
  ],
};
/** R4: only config reads process.env (member access, destructuring, import, globalThis). */
const R4_ENV = {
  properties: [{ object: "process", property: "env", message: MESSAGES.env }],
  paths: [
    { name: "process", importNames: ["env"], message: MESSAGES.env },
    { name: "node:process", importNames: ["env"], message: MESSAGES.env },
  ],
  syntax: [
    {
      selector: "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
      message: MESSAGES.env,
    },
    {
      selector: "MemberExpression[object.property.name='process'][property.name='env']",
      message: MESSAGES.env,
    },
  ],
};

/**
 * Emits ONE config object with at most one entry each for no-restricted-imports,
 * no-restricted-syntax and no-restricted-properties, composed from the given atoms.
 */
function scope(files, ignores, atoms, { noConsole = false } = {}) {
  const paths = atoms.flatMap((atom) => atom.paths ?? []);
  const patterns = atoms.flatMap((atom) => atom.patterns ?? []);
  const syntax = atoms.flatMap((atom) => atom.syntax ?? []);
  const properties = atoms.flatMap((atom) => atom.properties ?? []);
  const rules = {};
  if (paths.length > 0 || patterns.length > 0) {
    const options = {};
    if (paths.length > 0) options.paths = paths;
    if (patterns.length > 0) options.patterns = patterns;
    rules["no-restricted-imports"] = ["error", options];
  }
  if (syntax.length > 0) rules["no-restricted-syntax"] = ["error", ...syntax];
  if (properties.length > 0) rules["no-restricted-properties"] = ["error", ...properties];
  if (noConsole) rules["no-console"] = "error";
  return ignores.length > 0 ? { files, ignores, rules } : { files, rules };
}

const SRC = { noConsole: true };
const NOT_DB_OR_CONFIG = ["src/modules/{database,config}/**"];

const boundaryScopes = [
  // S1 app + other root src files (instrumentation has its own scope)
  scope(
    ["src/app/**/*.{ts,tsx}", "src/*.{ts,tsx}"],
    ["src/instrumentation.ts"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV],
    SRC,
  ),
  // S2 instrumentation: process.env allowed (Next runtime file)
  scope(["src/instrumentation.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB], SRC),
  // S3/S4 database: mongodb allowed
  scope(["src/modules/database/*.ts"], [], [R1_DEEP, R1_ESCAPE_1, R2_APP, R4_ENV], SRC),
  scope(["src/modules/database/internal/*.ts"], [], [R1_DEEP, R1_ESCAPE_2, R2_APP, R4_ENV], SRC),
  // S5/S6 config: process.env allowed
  scope(["src/modules/config/*.ts"], [], [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB], SRC),
  scope(["src/modules/config/internal/*.ts"], [], [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB], SRC),
  // S7/S8 every other module
  scope(
    ["src/modules/*/*.{ts,tsx}"],
    NOT_DB_OR_CONFIG,
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV],
    SRC,
  ),
  scope(
    ["src/modules/*/internal/*.{ts,tsx}"],
    NOT_DB_OR_CONFIG,
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV],
    SRC,
  ),
  // S9 nested internal directories are forbidden outright
  scope(["src/modules/*/internal/*/**/*.{ts,tsx}"], [], [R1_FLAT_INTERNAL]),
  // S10 unit tests
  scope(["tests/unit/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S11 integration tests: mongodb allowed (labelled MongoErrors, ClientSession spies)
  scope(["tests/integration/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R4_ENV]),
  // S12 test setup and helpers: process.env allowed
  scope(["tests/setup/**/*.ts", "tests/helpers/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES]),
];
// Root config files (*.config.ts, eslint.config.mjs) are deliberately unscoped: they are the
// spec's "Next/tooling config files" exception.

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    "tests/fixtures/**",
    ".agenkit/**",
    ".claude/**",
  ]),
  ...nextVitals,
  ...nextTs,
  unusedVars,
  ...boundaryScopes,
  prettier,
]);
```

- [ ] **Step 5: Run the boundary test to verify it passes**

Run: `bun run test:unit -- tests/unit/lint/boundaries.test.ts`
Expected: PASS, with `Tests  11 passed (11)`.

If the `mongodb-outside-database.ts` cases report only `[1]`, then the `ImportExpression` selector did not match. Run `node -e "console.log(require('esquery').parse('ImportExpression[source.value=/^(mongodb|bson)(\\\\x2F|$)/]'))"` to check that the selector parses. Fix the selector only. Do not loosen the expected lines.

- [ ] **Step 6: Create the placeholder modules**

Each of these five files contains exactly one line:

`src/modules/privacy/index.ts`, `src/modules/wallet/index.ts`, `src/modules/payments/index.ts`, `src/modules/blockchain/index.ts`, `src/modules/security/index.ts`:
```ts
export {};
```

- [ ] **Step 7: Lint the whole repository under the new rules**

Run: `bun run lint`
Expected: exits 0 with no output. If it reports a boundary violation in real source, fix the source to respect the rule, for example by importing through `@/modules/<name>`. Never weaken a scope.

- [ ] **Step 8: Run everything and typecheck**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test && bun run typecheck`
Expected: every unit and integration test passes, and typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add eslint.config.mjs src/modules/privacy src/modules/wallet src/modules/payments src/modules/blockchain src/modules/security tests/fixtures/lint tests/unit/lint/boundaries.test.ts
git commit -m "feat(lint): enforce module boundaries with scoped no-restricted rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: ADRs 0001–0004, OPEN_DECISIONS, README and doc pointers

**Files:**
- Create: `docs/adr/0001-single-app-module-boundaries.md`, `docs/adr/0002-bun-tooling-node-runtime.md`, `docs/adr/0003-mongodb-driver-zod.md`, `docs/adr/0004-vitest-memory-replset.md`
- Modify: `docs/OPEN_DECISIONS.md` (§3, two items, plus a §6 pointer), `docs/TECHNICAL_ARCHITECTURE.md` (§2, two table rows), `docs/README.md` (one table row), `README.md` (append a "Development setup" section)

**Interfaces:**
- Consumes: every implementation decision from Tasks 1–11. It also uses two facts from your Task 1 and Task 10 reports: the list of blocked postinstalls, whether `next build` rewrote `tsconfig.json`, and how `bun run start` behaved with invalid config.
- Produces: ADR files in the `docs/OPEN_DECISIONS.md` §6 format (decision, date, owner/approver, rationale, evidence/reference, consequences, and scope/privacy/security impact). Task 13 follows the same format.

Every ADR uses this fixed heading order: `Status`, `Date`, `Owner / approver`, `Decision`, `Context`, `Rationale`, `Alternatives considered`, `Evidence / references`, `Consequences`, `Scope / privacy / security impact`.

- [ ] **Step 1: Write ADR-0001**

`docs/adr/0001-single-app-module-boundaries.md`:
```markdown
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
- Enforcement: `eslint.config.mjs` (scopes S1–S12); proof: `tests/unit/lint/boundaries.test.ts`.

## Consequences

- A flat-config object that sets the same rule replaces it, so each scope emits exactly one
  composed entry per rule and scopes use disjoint globs. Contributors must extend the scope helper
  instead of adding overlapping rule objects.
- Module dependency direction (`shared`/`validation` import nothing; `config` imports `shared`;
  `database` imports `config` and `shared`) is a review convention, not yet lint-enforced.
- Moving a module into a package later is mechanical: its `index.ts` is already the package API.

## Scope / privacy / security impact

- Scope: no product scope change.
- Privacy: positive. The privacy adapter can be lint-isolated in PR 03.
- Security: positive. Only `config` reads environment secrets and only `database` holds the driver.
```

- [ ] **Step 2: Write ADR-0002**

`docs/adr/0002-bun-tooling-node-runtime.md`. The section "Observed during implementation" is the one place filled from your task reports. Replace each bracketed `[FILL: ...]` marker with the observed fact, or with `None observed.`:
```markdown
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

- Blocked lifecycle scripts reported by `bun install` (not trusted): [FILL: package names from the Task 1 report, or "None observed."]
- `next build` rewrote `tsconfig.json`: [FILL: "No." or the exact change committed in Task 1]
- `bun run start` with invalid config: [FILL: "Exits non-zero with the ConfigError message." or the observed behaviour from Task 10]
- Next.js 16.4.6 security status at implementation time: [FILL: "Not a security release; 16.4.5 kept." or "Security release; 16.4.6 adopted."]

## Consequences

- `bun test` runs Bun's own runner and must never be used; `bun run test` runs Vitest (README).
- The local Node is 24.0.2; moving to the current 24.x LTS patch is recommended, not blocking.
- Every pin must be re-checked against the soak rule when upgrading.

## Scope / privacy / security impact

- Scope: none.
- Privacy: none.
- Security: positive. Exact pins, a frozen lockfile, untrusted postinstalls blocked, and a soak window.
```

- [ ] **Step 3: Write ADR-0003**

`docs/adr/0003-mongodb-driver-zod.md`:
```markdown
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

## Scope / privacy / security impact

- Scope: none.
- Privacy: neutral. No personal data is stored by this PR.
- Security: positive. Credentials in URIs are scrubbed from logs, and the driver's parse errors
  (which can echo the URI) are not surfaced.
```

- [ ] **Step 4: Write ADR-0004**

`docs/adr/0004-vitest-memory-replset.md`:
```markdown
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
- MongoDB 7.0.12 is pinned because the library default (8.2.6) publishes no Ubuntu 20.04 build
  and the local `mongod` is 7.0.12.
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
```

- [ ] **Step 5: Update `docs/OPEN_DECISIONS.md` §3 and §6**

Replace the line:
```markdown
- [ ] Inspect repository before locking package architecture.
```
with:
```markdown
- [x] Inspect repository before locking package architecture. Resolved 2026-11-12: documentation-only repository; single Next.js app with internal module boundaries ([ADR-0001](adr/0001-single-app-module-boundaries.md)).
```

Replace the line:
```markdown
- [ ] Confirm MongoDB conventions and whether Mongoose is used.
```
with:
```markdown
- [x] Confirm MongoDB conventions and whether Mongoose is used. Resolved 2026-11-12: no prior convention and no Mongoose; official driver with Zod schemas ([ADR-0003](adr/0003-mongodb-driver-zod.md)).
```

Leave `- [ ] Confirm Next.js/Bun/TypeScript compatibility with Helius SDK and wallet adapters.` unchanged here. Task 13 updates it from ADR-0005 evidence.

In §6, after the line `Until resolved, the item remains an explicit assumption or blocker.`, append a blank line and then:
```markdown
Resolved items are recorded as ADRs in [`docs/adr/`](adr/), using the fields above.
```

- [ ] **Step 6: Update `docs/TECHNICAL_ARCHITECTURE.md` §2 and `docs/README.md`**

In `docs/TECHNICAL_ARCHITECTURE.md`, replace:
```markdown
| Runtime/package manager | Bun |
```
with:
```markdown
| Runtime/package manager | Node 24 runtime; Bun as package manager and script runner ([ADR-0002](adr/0002-bun-tooling-node-runtime.md)) |
```
and replace:
```markdown
| Database | MongoDB / existing repository convention |
```
with:
```markdown
| Database | MongoDB, official driver with Zod schemas ([ADR-0003](adr/0003-mongodb-driver-zod.md)) |
```

In `docs/README.md`, after the `| [Open decisions](OPEN_DECISIONS.md) | ... |` row, add:
```markdown
| [Architecture decision records](adr/) | Recorded stack and integration decisions (ADR-0001 onward) |
```

- [ ] **Step 7: Append the "Development setup" section to `README.md`**

Append at the end of `README.md`, after the "Development rule" section:
````markdown

## Development setup

### Prerequisites

- **Node 24** (`.nvmrc`; `nvm use`). Node is the only runtime ([ADR-0002](docs/adr/0002-bun-tooling-node-runtime.md)).
- **Bun 1.4.4**, used only as the package manager and script runner.
- **MongoDB 7.0+ as a replica set** for local development (transactions need one). Tests start their own in-memory replica set.

### First run

```bash
bun install --frozen-lockfile
cp .env.example .env.local        # then edit values; never commit .env files
mkdir -p .data/db
mongod --replSet rs0 --dbpath ./.data/db --bind_ip 127.0.0.1 &
mongosh --quiet --eval "rs.initiate()"
bun run dev                       # http://localhost:3000, /api/health, /api/ready
```

The server validates configuration at boot and refuses to start if any key is missing or invalid.
The error names the keys, never their values.

### Configuration

| Key | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | `mongodb://` or `mongodb+srv://` connection string (replica set for transactions) |
| `MONGODB_DB_NAME` | yes | 1–63 chars of `A-Z a-z 0-9 _ -` |
| `LOG_LEVEL` | no | `debug`, `info` (default), `warn` or `error` |
| `NODE_ENV` | set by tooling | `development`, `test` or `production`. Set by Next.js and Vitest |
| `MONGOMS_SYSTEM_BINARY` | tests only, optional | Path to a local `mongod` 7.0.x (e.g. `/usr/bin/mongod`) instead of downloading one |

### Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Next.js dev server |
| `bun run build` | Production build (works without a `.env`) |
| `bun run start` | Serve the production build |
| `bun run lint` | ESLint, including the module boundary rules (zero warnings allowed) |
| `bun run typecheck` | `next typegen` then `tsc --noEmit` |
| `bun run test` | All Vitest projects (unit + integration) |
| `bun run test:unit` / `bun run test:integration` | One project only |
| `bun run test:coverage` | Tests with a V8 coverage report in `coverage/` (no threshold) |
| `bun run format` / `bun run format:check` | Prettier write / check |

> **Never run `bun test`.** It starts Bun's built-in test runner, not Vitest. Always use `bun run test`.

On hosts without a downloadable MongoDB build (for example Ubuntu 20.04), export
`MONGOMS_SYSTEM_BINARY=/usr/bin/mongod` before running tests.

### Module boundaries

Application code lives in `src/modules/<name>/`, each with a public `index.ts` and a flat `internal/`
directory ([ADR-0001](docs/adr/0001-single-app-module-boundaries.md)). `bun run lint` enforces:

1. Outside a module, import only `@/modules/<name>`. Deep imports (`@/modules/<name>/internal/...`) are errors.
2. Files under `src/modules/**` never import from `src/app/**`.
3. Only `src/modules/database/**` may import `mongodb`.
4. Only `src/modules/config/**` may read `process.env` (exceptions: tooling config files, `src/instrumentation.ts`, test setup).

All logging goes through the redacting logger in `@/modules/shared`; `console.*` is not allowed in `src/`.

### Decisions

Stack decisions are recorded in [`docs/adr/`](docs/adr/). Open questions live in
[`docs/OPEN_DECISIONS.md`](docs/OPEN_DECISIONS.md).
````

- [ ] **Step 8: Fill the ADR-0002 observations and check for leftover markers**

Fill each `[FILL: ...]` in ADR-0002 from your Task 1 and Task 10 reports.

Run: `grep -rn "\[FILL" docs/adr/0001-*.md docs/adr/0002-*.md docs/adr/0003-*.md docs/adr/0004-*.md`
Expected: no output.

Run: `grep -n "\[x\]" docs/OPEN_DECISIONS.md`
Expected: exactly two lines. Both are §3 items, and each links to its ADR.

- [ ] **Step 9: Verify nothing else regressed**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run lint && bun run typecheck && bun run test`
Expected: all pass. Docs are not linted, so this only confirms the tree is still green.

- [ ] **Step 10: Commit**

```bash
git add docs/adr/0001-single-app-module-boundaries.md docs/adr/0002-bun-tooling-node-runtime.md docs/adr/0003-mongodb-driver-zod.md docs/adr/0004-vitest-memory-replset.md docs/OPEN_DECISIONS.md docs/TECHNICAL_ARCHITECTURE.md docs/README.md README.md
git commit -m "docs: add ADRs 0001-0004, development setup and resolved open decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ADR-0005 Helius SDK discovery (research only)

**This is a research task. Its findings cannot be written in advance.** The plan fixes the method, the record format and the verification. Every fact in the ADR must come from a source you opened during this task and cite by URL or command. Do not copy facts from this plan, from the architecture document or from memory. Architecture §9.11 noted `helius-sdk` 3.4.1, `"type": "module"` and `engines node >=20` on 2026-11-12. That note is a lead to re-verify, not evidence. **Do not install any Helius package into the repository**, and do not add it to `package.json`.

**Files:**
- Create: `docs/adr/0005-helius-sdk-discovery.md`
- Modify: `docs/OPEN_DECISIONS.md` (§1 items, and the §3 compatibility item)

**Interfaces:**
- Consumes: the ADR format from Task 12, and `docs/AGENT_GUIDE.md` §4 (never invent SDK method names, RPC URLs, parameters, error codes or wallet capabilities; cite exact documentation and version).
- Produces: a record that PR 03 (the Helius adapter) builds on. Each `OPEN_DECISIONS.md` §1 item gets one of three statuses: **Answered** (the docs clearly answer it, with a link), **Partially answered** (some evidence, with the gap stated) or **Unanswered**.

- [ ] **Step 1: Make a scratch directory outside the repo for raw evidence**

Run: `export HELIUS_RESEARCH=$(mktemp -d) && echo "$HELIUS_RESEARCH"`
Expected: a path under `/tmp`. Everything downloaded in this task goes there and is never committed.

- [ ] **Step 2: Capture npm metadata for the SDK package**

Run:
```bash
npm view helius-sdk name version dist-tags type main module types exports engines license repository.url --json | tee "$HELIUS_RESEARCH/helius-sdk.view.json"
npm view helius-sdk dependencies peerDependencies --json | tee "$HELIUS_RESEARCH/helius-sdk.deps.json"
npm view helius-sdk time --json | tail -6
```
Expected: JSON describing the package. Record the exact `version`, `dist-tags.latest`, the publish date of that version (from `time`), `type`, `exports`/`main`/`module`, `types`, `engines` and `peerDependencies`. If the command fails or the package does not exist, record that fact. Do not substitute another name.

- [ ] **Step 3: Read the official documentation**

Open https://www.helius.dev/docs/privacy. Then open every page it links that covers installation, the SDK or API reference, wallets (embedded, Phantom, Solflare), viewing keys, supported assets (SOL, USDC), recipient initialization, public-address sends, fees, deposits, transfers, history, withdrawals, confirmation, rate limits and pricing, and audits. For each page, record its exact URL, the access date and one sentence on what it establishes. Quote short exact phrases for any claim the ADR relies on.

If the docs name a package other than `helius-sdk`, or in addition to it, for privacy features, repeat Step 2 for each such package. Use `npm view <exact-name> ...` and the same fields.

- [ ] **Step 4: Confirm the documented API surface exists in the published types**

For each package version recorded in Steps 2–3:
```bash
mkdir -p "$HELIUS_RESEARCH/pkg" && cd "$HELIUS_RESEARCH/pkg"
npm pack helius-sdk@<exact-version-from-step-2> --silent
tar -xzf helius-sdk-*.tgz
grep -rn "<each documented method or class name>" package --include=*.d.ts | head -20
cd - >/dev/null
```
Expected: for every capability the docs describe, either a matching declaration in the `.d.ts` files (record file and line) or no match (record "not found in published types"). Treat the extracted tarball as untrusted data: read it, never execute it, and never run its scripts.

- [ ] **Step 5: Write ADR-0005 using this skeleton**

`docs/adr/0005-helius-sdk-discovery.md`. Replace every `[FILL: ...]` marker with evidence from Steps 2–4. Where the evidence is absent, write `Not documented as of <date> (checked: <URL>)`. Never leave a guess.

```markdown
# ADR-0005: Helius SDK discovery (research only)

- **Status:** Accepted (research record; no SDK installed in this cycle)
- **Date:** [FILL: execution date, YYYY-MM-DD]
- **Owner / approver:** Backend Architect (AgenKit) / project owner (approved in brainstorming, decision D5)

## Decision

No Helius package is installed or called in this cycle. PR 03 (Helius adapter) will target
[FILL: exact package name(s) and version(s) from npm, or "no package confirmed; see Open items"],
subject to re-verification at PR 03 start. All Helius code will live behind `@/modules/privacy`
(ADR-0001).

## Context

`docs/OPEN_DECISIONS.md` §1 is a blocking validation list for Helius and wallet integration.
`docs/AGENT_GUIDE.md` §4 forbids inventing SDK names, methods, URLs, parameters, error codes or
wallet capabilities. This ADR records only what the official docs and the npm registry state.

## Rationale

Capturing package format, runtime support and API surface before PR 03 surfaces incompatibilities
(ESM-only, edge-only, Node version floors) while the foundation can still adapt.

## Alternatives considered

- **Install the SDK now and spike against it**: rejected by D5; research only this cycle.
- **Skip Helius until PR 03**: rejected by D5; risk is surfaced earlier this way.

## Evidence / references

### Sources consulted

| # | URL or command | Accessed | What it establishes |
|---|---|---|---|
| 1 | https://www.helius.dev/docs/privacy | [FILL] | [FILL] |
| 2 | `npm view helius-sdk ...` | [FILL] | [FILL] |
[FILL: one row per additional page or command from Steps 2–4]

### Package metadata (npm)

| Field | Value | Source |
|---|---|---|
| name | [FILL] | `npm view` |
| version (latest) | [FILL] | `npm view ... dist-tags` |
| published | [FILL] | `npm view ... time` |
| module type (`type`) | [FILL] | `npm view` |
| entry points (`exports` / `main` / `module`) | [FILL] | `npm view` |
| type declarations (`types`) | [FILL] | `npm view` |
| `engines.node` | [FILL] | `npm view` |
| peer dependencies | [FILL] | `npm view` |
| license | [FILL] | `npm view` |
[FILL: repeat the table for each additional package named by the docs]

### Runtime and module format

- ESM / CommonJS: [FILL]
- Node vs edge/browser support (as documented): [FILL, with link]
- Fit with this repository (ESM project, Node 24, Next.js 16 Node-runtime route handlers): [FILL: compatible / incompatible / unknown, and why]

### Documented API surface

| Capability | Exact documented name | Doc URL | In published `.d.ts`? (file:line) |
|---|---|---|---|
[FILL: one row per capability found in Step 3; "not documented" rows are allowed and expected]

### OPEN_DECISIONS §1 assessment

| §1 item | Status (Answered / Partially answered / Unanswered) | Evidence summary | Link(s) |
|---|---|---|---|
| Confirm current Helius TypeScript SDK package/version, installation, API surface | [FILL] | [FILL] | [FILL] |
| Confirm embedded private wallet production availability, onboarding, custody, recovery, signing | [FILL] | [FILL] | [FILL] |
| Confirm Phantom integration for private balance reads, viewing context and signing | [FILL] | [FILL] | [FILL] |
| Confirm Solflare integration for same | [FILL] | [FILL] | [FILL] |
| Confirm whether external-wallet viewing-key handling differs by provider | [FILL] | [FILL] | [FILL] |
| Confirm SOL support per wallet path | [FILL] | [FILL] | [FILL] |
| Confirm USDC official mint, token program and Ring support per wallet path | [FILL] | [FILL] | [FILL] |
| Confirm private recipient initialization requirements | [FILL] | [FILL] | [FILL] |
| Confirm exact behavior sending to normal public Solana address | [FILL] | [FILL] | [FILL] |
| Confirm public SOL fee payer/reserve requirements | [FILL] | [FILL] | [FILL] |
| Confirm deposit, transfer, history, withdrawal and confirmation/reconciliation APIs | [FILL] | [FILL] | [FILL] |
| Confirm production RPC/prover rate limits, pricing, failure modes and support | [FILL] | [FILL] | [FILL] |
| Review latest audits and formal verification status | [FILL] | [FILL] | [FILL] |

Status rule: **Answered** only when the official docs state it clearly and the link is given.
Items about behavior "per wallet path" or in production are at most **Partially answered** from
documentation alone. They still need the hands-on validation gate in the README ("Development rule").

## Consequences

[FILL: what PR 03 must do or watch for, e.g. runtime constraints, package format, items that block it]

## Scope / privacy / security impact

- Scope: [FILL: none / describe any scope risk the evidence reveals]
- Privacy: [FILL: documented privacy properties and limits, quoted with links; no new claims]
- Security: [FILL: custody/signing/viewing-key handling as documented, with links; no private material recorded]

## Open items carried forward

[FILL: every §1 item not marked Answered, one line each, with what evidence would close it]
```

- [ ] **Step 6: Update `docs/OPEN_DECISIONS.md` §1 and §3 from the ADR**

For each §1 item, apply the status from the ADR table:
- **Answered:** change `- [ ]` to `- [x]` and append ` Answered by docs ([ADR-0005](adr/0005-helius-sdk-discovery.md); <primary doc URL>).`
- **Partially answered:** keep `- [ ]` and append ` Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): <one-clause gap>.`
- **Unanswered:** keep `- [ ]` and append ` Unanswered by docs as of <date> ([ADR-0005](adr/0005-helius-sdk-discovery.md)).`

For §3 `Confirm Next.js/Bun/TypeScript compatibility with Helius SDK and wallet adapters.`: tick it only if ADR-0005 shows documented compatibility for **both** the SDK and the wallet adapters. Wallet adapters are not evaluated in this cycle, so the expected outcome is to keep `- [ ]` and append ` Partially answered ([ADR-0005](adr/0005-helius-sdk-discovery.md)): SDK <format/runtime finding>; wallet adapters not yet evaluated.`

- [ ] **Step 7: Verify the record is complete and contains no guesses or secrets**

Run: `grep -n "\[FILL" docs/adr/0005-helius-sdk-discovery.md`
Expected: no output.

Run: `grep -c "^| Confirm\|^| Review" docs/adr/0005-helius-sdk-discovery.md`
Expected: `13`.

Run: `grep -n "ADR-0005" docs/OPEN_DECISIONS.md | wc -l`
Expected: `14` (13 §1 items plus the §3 item).

Run: `grep -niE "api[-_ ]?key=|seed phrase:|private key:" docs/adr/0005-helius-sdk-discovery.md`
Expected: no output. Never paste API keys or wallet material, even example ones from the docs.

Re-read every URL in the "Sources consulted" table. Each one must be an `https://` URL you actually opened, or an `npm` command you actually ran.

- [ ] **Step 8: Commit**

```bash
git add docs/adr/0005-helius-sdk-discovery.md docs/OPEN_DECISIONS.md
git commit -m "docs: record Helius SDK discovery findings (ADR-0005)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Final verification against the acceptance criteria

**Files:**
- Modify: any files `bun run format` changes (formatting only)
- No new files.

**Interfaces:**
- Consumes: everything from Tasks 1–13.
- Produces: evidence for spec §8, acceptance criteria 1–5, captured in your task report.

- [ ] **Step 1: Apply and check formatting**

Run: `bun run format && bun run format:check`
Expected: `All matched files use Prettier code style!`

If `git status --short` shows changes, re-run `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run lint && bun run typecheck && bun run test`. Expected: all pass. Then commit only the reformatted tracked files:
```bash
git add -u
git commit -m "style: apply prettier formatting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
`git add -u` stages modified tracked files only, so it cannot pick up the untracked `.agenkit/`, `.claude/`, `AGENTS.md` or `agenkit.lock.json`.

- [ ] **Step 2: Fresh-clone gate (acceptance criterion 1)**

Run:
```bash
export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod
WORK=$(mktemp -d)
git clone --quiet --branch feat/discovery-foundation /home/Ghostwire "$WORK/ghostwire"
cd "$WORK/ghostwire"
bun install --frozen-lockfile && bun run lint && bun run typecheck && bun run test && bun run build
echo "gate-exit=$?"
git status --short
ls .env 2>/dev/null; echo "env-files-checked"
cd - >/dev/null
```
Expected:
- `bun install` prints no lockfile changes.
- Lint and typecheck exit 0.
- Vitest reports `Test Files  16 passed (16)` (10 unit and 6 integration) and `Tests  161 passed (161)` (112 unit and 49 integration), with no `failed` entry. If a task legitimately added tests, the totals rise, but `failed` must stay absent.
- `next build` lists `/`, `ƒ /api/health` and `ƒ /api/ready`.
- The output ends with `gate-exit=0`.
- `git status --short` prints nothing: the build did not rewrite tracked files.
- No `.env` exists. The build passed without one.

- [ ] **Step 3: Coverage script runs (spec §3 scripts)**

Run: `export MONGOMS_SYSTEM_BINARY=/usr/bin/mongod && bun run test:coverage`
Expected: the tests pass and a V8 text coverage table is printed for `src/**`. No threshold is enforced.

- [ ] **Step 4: Secret scan (acceptance criterion 3)**

Run:
```bash
git ls-files | grep -E '(^|/)\.env'
```
Expected: exactly `.env.example`.

Run:
```bash
git grep -nIE '[a-z][a-z0-9+.-]*://[^[:space:]/@"]+:[^[:space:]/@"]+@' -- ':!docs'
```
Expected: hits only in `tests/unit/shared/logger.test.ts`, which holds the fake credentials (`alice:s3cr3t@db.example.com`, `bob:pw@h`, `u:p@h`) used to prove redaction, and in `src/modules/shared/internal/redact.ts`, in the doc comment `scheme://user:pass@`. Any other hit is a blocker. Remove it and rotate the credential if it was real.

Run:
```bash
git grep -nIiE "(apikey|api_key|secret|password|privatekey|private_key|mnemonic)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"']{6,}" -- ':!docs' ':!bun.lock'
```
Expected: hits only in `tests/unit/shared/logger.test.ts` (for example `apiKey: "secret-value"`), each an obviously fake test value. Any other hit is a blocker.

If `gitleaks` is installed (`command -v gitleaks`), also run `gitleaks detect --no-banner --redact`. Expected: `no leaks found`, or only the fake values listed above.

Run: `grep -oE "^#? ?[A-Z_]+=" .env.example`
Expected: four lines, `MONGODB_URI=`, `MONGODB_DB_NAME=`, `LOG_LEVEL=` and `# MONGOMS_SYSTEM_BINARY=`. `NODE_ENV` is documented in a comment. Together these cover every config key.

- [ ] **Step 5: Confirm acceptance criteria 2, 4 and 5**

Run:
```bash
ls docs/adr/
grep -c "^- \*\*Owner / approver:\*\*" docs/adr/000*.md
grep -n "ADR-000" docs/OPEN_DECISIONS.md
grep -n "## Development setup" README.md
grep -n "bun test" README.md
```
Expected:
- Five ADR files, `0001` through `0005`.
- Every ADR shows `1` for the owner/approver field.
- `OPEN_DECISIONS.md` links ADR-0001 and ADR-0003 (on the §3 ticks) and ADR-0005 (on 14 lines).
- `README.md` has the "Development setup" section and the `bun test` warning.

Then fill in this checklist in your task report, citing the evidence line for each item:

| Spec §8 criterion | Evidence |
|---|---|
| 1. Fresh clone: install, lint, typecheck, test and build all pass | Step 2 output, `gate-exit=0` |
| 2. ADRs 0001–0005 in §6 format; OPEN_DECISIONS updated and linked | Step 5 output |
| 3. No secrets committed; `.env.example` documents every key | Step 4 output |
| 4. README documents setup, scripts and boundary rules | `README.md` "Development setup" section |
| 5. Roadmap PR 01 criteria (reproducible setup, build/lint/tests pass, no secrets, environment documented) | Steps 2–4 together |

- [ ] **Step 6: Confirm the history is clean and hand off**

Run: `git log --oneline main..HEAD`
Expected: the Task 1–14 commits on top of the existing docs commits. Run `git log -1 --format=%B` on any of them. Each message ends with a blank line followed by `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Run: `git status --short`
Expected: only the pre-existing untracked `.agenkit/`, `.claude/`, `AGENTS.md` and `agenkit.lock.json`.

Do not push and do not open a PR. Hand off to the requesting-code-review skill, then finishing-a-development-branch.

---

## Appendix: spec coverage map

| Spec requirement | Task |
|---|---|
| §3 ADRs 0001–0004 | 12 |
| §3 ADR-0005 (package, version, runtimes, module format, API surface, §1 items with links, nothing guessed) | 13 |
| §3 OPEN_DECISIONS §3 ticks with ADR links; Helius compatibility ticked only on evidence | 12, 13 |
| §3 Next.js App Router, TS strict + `noUncheckedIndexedAccess`, ESLint, Prettier | 1, 11 |
| §3 module skeleton with public `index.ts` (incl. placeholders) | 2–9, 11 |
| §3/§5 `config` schema, `loadConfig`, `resetConfigForTests`, `ConfigError` without values, `.env.example` | 2, 6 |
| §5 `database` getDb, ping, withTransaction, registerIndexes/ensureIndexes, typedCollection, closeDb | 7, 8, 9 |
| §5 `shared` AppError hierarchy, Result, redacting logger, toErrorResponse | 2, 3, 4 |
| §5 `validation` baseUnits, objectIdString | 5 |
| §5 routes `/api/health`, `/api/ready` (`force-dynamic`, `no-store`, Node runtime) | 10 |
| §6 fail fast on invalid config (boot-time `instrumentation.ts`) | 10 |
| §3 scripts lint, typecheck, test, test:coverage, build, dev, format | 1 (verified in 14) |
| §4 boundary rules 1–4 | 11 |
| §7 unit tests (loadConfig, baseUnits, redaction, toErrorResponse) | 3, 4, 5, 6 |
| §7 integration tests (ping up/down, transactions, ensureIndexes, typedCollection, routes) | 7, 8, 9, 10 |
| §7 boundary fixture test via the ESLint API | 11 |
| §3 README "Development setup" | 12 |
| §8 acceptance criteria 1–5 | 14 |
