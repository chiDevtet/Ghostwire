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
    // ESLint prefixes its own "'x' import is restricted ..." text; the configured message is the suffix.
    for (const m of messages) expect(m.message.endsWith(message), m.message).toBe(true);
  });
});
