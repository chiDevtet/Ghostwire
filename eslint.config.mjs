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
