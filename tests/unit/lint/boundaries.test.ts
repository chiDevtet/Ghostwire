import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const CHECKED_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "no-restricted-properties",
  "no-console",
]);

const MSG = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  relIntoModules: "Use '@/modules/<name>', not relative paths into src/modules.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
  flat: "internal/ must be flat; no subdirectories.",
  console: "Unexpected console statement.",
  clientServer:
    "Client code (wallet-connect, ui, components) may import only '@/modules/validation' and '@/modules/wallet-connect' among modules.",
  clientNode: "Client code (wallet-connect, ui, components) must not import 'node:*'.",
  serverClient:
    "Server modules must not import '@/modules/wallet-connect', '@/ui/*' or '@/components/*'.",
  nextServer: "Only src/app/** may import next/headers or the server functions of next/navigation.",
  wcUi: "src/modules/wallet-connect/** must not import '@/ui/*' or '@/components/*'.",
  uiLayer: "src/ui/** must not import '@/modules/wallet-connect' or '@/components/*'.",
  bs58: "Only wallet/internal/base58.ts and wallet-connect/internal/base58.ts may import 'bs58'.",
};

const IMPORTS = "no-restricted-imports";
const SYNTAX = "no-restricted-syntax";
const PROPS = "no-restricted-properties";
const CONSOLE = "no-console";

/** One expected violation: source line, rule id, and the message the config must produce. */
type Expected = readonly [line: number, ruleId: string, message: string];

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, "eslint.config.mjs"),
  });
});

async function boundaryMessages(
  fixture: string,
  virtualPath: string,
): Promise<Linter.LintMessage[]> {
  const code = await readFile(path.join(repoRoot, "tests/fixtures/lint", fixture), "utf8");
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, virtualPath) });
  if (result === undefined) throw new Error(`no lint result for ${fixture}`);
  expect(result.messages.filter((m) => m.fatal === true)).toEqual([]);
  return result.messages.filter((m) => m.ruleId !== null && CHECKED_RULES.has(m.ruleId));
}

describe("module boundary lint rules", { timeout: 60_000 }, () => {
  it.each<{ fixture: string; virtualPath: string; expected: Expected[] }>([
    // --- original scopes ---
    {
      fixture: "deep-import.ts",
      virtualPath: "src/app/__lint__/deep-import.ts",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    {
      fixture: "relative-escape.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "module-imports-app.ts",
      virtualPath: "src/modules/shared/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.app]],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/payments/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "tests/unit/__lint__.test.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/app/__lint__/env.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/wallet/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "allowed-database.ts",
      virtualPath: "src/modules/database/internal/__lint__.ts",
      expected: [],
    },
    {
      fixture: "allowed-config.ts",
      virtualPath: "src/modules/config/internal/__lint__.ts",
      expected: [],
    },
    { fixture: "allowed-config.ts", virtualPath: "src/instrumentation.ts", expected: [] },

    // --- fix round: files outside the named scopes still get the rules ---
    {
      fixture: "unscoped-multi.ts",
      virtualPath: "src/lib/x.ts",
      expected: [
        [1, IMPORTS, MSG.deep],
        [2, IMPORTS, MSG.mongodb],
        [3, PROPS, MSG.env],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/wallet/lib/x.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "tsx-deep.ts",
      virtualPath: "src/modules/database/internal/__lint__.tsx",
      expected: [[1, IMPORTS, MSG.deep]],
    },

    // --- fix round: dynamic import() and require() ---
    {
      fixture: "dynamic-imports.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, SYNTAX, MSG.deep],
        [2, SYNTAX, MSG.app],
      ],
    },
    {
      fixture: "require-calls.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [
        [1, SYNTAX, MSG.deep],
        [2, SYNTAX, MSG.mongodb],
        [3, SYNTAX, MSG.app],
      ],
    },

    // --- fix round: the "./" prefix no longer hides a relative escape ---
    {
      fixture: "dot-escape-root.ts",
      virtualPath: "src/modules/wallet/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "dot-escape-internal.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },

    // --- fix round: remaining rules pinned once each ---
    {
      fixture: "relative-into-modules.ts",
      virtualPath: "src/app/__lint__/rel.ts",
      expected: [[1, IMPORTS, MSG.relIntoModules]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/modules/wallet/internal/__lint__.ts",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      // src/instrumentation-node.ts is under S1: it must NOT read process.env.
      fixture: "allowed-config.ts",
      virtualPath: "src/instrumentation-node.ts",
      expected: [[1, PROPS, MSG.env]],
    },

    // --- PR 02a: the auth module and the v1 route tree get the same rules (no new scope) ---
    {
      fixture: "env-outside-config.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.env],
        [3, PROPS, MSG.env],
        [4, PROPS, MSG.env],
        [4, SYNTAX, MSG.env],
        [5, SYNTAX, MSG.env],
      ],
    },
    {
      fixture: "mongodb-outside-database.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [
        [1, IMPORTS, MSG.mongodb],
        [4, SYNTAX, MSG.mongodb],
      ],
    },
    {
      fixture: "module-imports-app.ts",
      virtualPath: "src/modules/auth/__lint__.ts",
      expected: [[1, IMPORTS, MSG.app]],
    },
    {
      fixture: "relative-escape.ts",
      virtualPath: "src/modules/auth/internal/__lint__.ts",
      expected: [[1, IMPORTS, MSG.escape]],
    },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/auth/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/modules/security/internal/__lint__.ts",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      fixture: "deep-import.ts",
      virtualPath: "src/app/api/v1/__lint__/deep.ts",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    // --- PR 02b: client/server layering, next server APIs, ui layer, bs58 containment ---
    ...[
      "src/modules/wallet-connect/internal/__lint__.ts",
      "src/ui/__lint__.tsx",
      "src/components/__lint__.tsx",
    ].map((virtualPath) => ({
      fixture: "client-imports-server.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.clientServer],
        [2, IMPORTS, MSG.mongodb],
        [3, IMPORTS, MSG.clientNode],
        [4, IMPORTS, MSG.clientServer],
        [6, SYNTAX, MSG.clientServer],
      ] satisfies Expected[],
    })),
    ...[
      "src/modules/auth/internal/__lint__.ts",
      "src/modules/database/internal/__lint__.ts",
      "src/modules/config/__lint__.ts",
    ].map((virtualPath) => ({
      fixture: "server-imports-client.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.serverClient],
        [2, IMPORTS, MSG.serverClient],
        [3, IMPORTS, MSG.serverClient],
      ] satisfies Expected[],
    })),
    { fixture: "server-imports-client.ts", virtualPath: "src/app/__lint__/ok.tsx", expected: [] },
    ...[
      "src/components/__lint__.tsx",
      "src/ui/__lint__.tsx",
      "src/modules/wallet-connect/internal/__lint__.ts",
      "src/modules/auth/internal/__lint__.ts",
    ].map((virtualPath) => ({
      // Line 2 reports twice (redirect and notFound) with the same message; useRouter is allowed.
      fixture: "next-server-imports.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.nextServer],
        [2, IMPORTS, MSG.nextServer],
        [3, SYNTAX, MSG.nextServer],
      ] satisfies Expected[],
    })),
    { fixture: "next-server-imports.ts", virtualPath: "src/app/(app)/__lint__.tsx", expected: [] },
    {
      fixture: "ui-imports-feature.ts",
      virtualPath: "src/ui/__lint__.tsx",
      expected: [
        [1, IMPORTS, MSG.uiLayer],
        [2, IMPORTS, MSG.uiLayer],
      ],
    },
    { fixture: "ui-imports-feature.ts", virtualPath: "src/components/__lint__.tsx", expected: [] },
    {
      fixture: "bs58-import.ts",
      virtualPath: "src/modules/wallet/internal/base58.ts",
      expected: [],
    },
    {
      fixture: "bs58-import.ts",
      virtualPath: "src/modules/wallet-connect/internal/base58.ts",
      expected: [],
    },
    ...[
      "src/modules/wallet/internal/address.ts",
      "src/modules/wallet-connect/internal/run-flow.ts",
      "src/components/__lint__.tsx",
      "src/app/__lint__/x.ts",
    ].map((virtualPath) => ({
      fixture: "bs58-import.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.bs58],
        [2, SYNTAX, MSG.bs58],
      ] satisfies Expected[],
    })),
    { fixture: "bs58-import.ts", virtualPath: "tests/helpers/__lint__.ts", expected: [] },
    { fixture: "client-component.tsx", virtualPath: "src/components/__lint__.tsx", expected: [] },
    {
      fixture: "nested-internal.ts",
      virtualPath: "src/modules/wallet-connect/internal/sub/__lint__.ts",
      expected: [[1, SYNTAX, MSG.flat]],
    },
    {
      fixture: "allowed-config.ts",
      virtualPath: "src/modules/wallet-connect/internal/__lint__.ts",
      expected: [[1, PROPS, MSG.env]],
    },
    {
      fixture: "console-call.ts",
      virtualPath: "src/ui/__lint__.tsx",
      expected: [[1, CONSOLE, MSG.console]],
    },
    {
      fixture: "deep-import.ts",
      virtualPath: "tests/ui/__lint__.test.tsx",
      expected: [[1, IMPORTS, MSG.deep]],
    },
    { fixture: "env-outside-config.ts", virtualPath: "src/proxy.ts", expected: [] },
    { fixture: "env-outside-config.ts", virtualPath: "tests/e2e/__lint__.spec.ts", expected: [] },
    // --- fix round 1: wallet-connect never imports ui/components; root files get next server rule ---
    ...[
      "src/modules/wallet-connect/__lint__.ts",
      "src/modules/wallet-connect/internal/__lint__.ts",
      "src/modules/wallet-connect/internal/base58.ts",
    ].map((virtualPath) => ({
      fixture: "wallet-connect-imports-ui.ts",
      virtualPath,
      expected: [
        [1, IMPORTS, MSG.wcUi],
        [2, IMPORTS, MSG.wcUi],
        [3, SYNTAX, MSG.wcUi],
      ] satisfies Expected[],
    })),
    ...["src/instrumentation-node.ts", "src/instrumentation.ts", "src/proxy.ts"].map(
      (virtualPath) => ({
        fixture: "next-server-imports.ts",
        virtualPath,
        expected: [
          [1, IMPORTS, MSG.nextServer],
          [2, IMPORTS, MSG.nextServer],
          [3, SYNTAX, MSG.nextServer],
        ] satisfies Expected[],
      }),
    ),
  ])("$fixture linted as $virtualPath", async ({ fixture, virtualPath, expected }) => {
    const messages = await boundaryMessages(fixture, virtualPath);

    // Exact set of (line, ruleId) pairs, so a violation cannot move to another rule or line.
    const key = (line: number, ruleId: string | null): string => `${line}:${ruleId}`;
    const actualKeys = [...new Set(messages.map((m) => key(m.line, m.ruleId)))].sort();
    expect(actualKeys).toEqual(
      [...new Set(expected.map(([line, ruleId]) => key(line, ruleId)))].sort(),
    );

    // Every message on a (line, ruleId) is the configured one (ESLint prefixes its own text).
    for (const [line, ruleId, message] of expected) {
      const forKey = messages.filter((m) => m.line === line && m.ruleId === ruleId);
      expect(forKey.length, `${line}:${ruleId} reported`).toBeGreaterThan(0);
      for (const m of forKey) expect(m.message.endsWith(message), m.message).toBe(true);
    }
  });
});
