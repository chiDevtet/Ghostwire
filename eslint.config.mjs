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
//
// ACCEPTED RESIDUAL RISKS (static linting cannot close these; decided acceptable):
//  - process.env aliasing: `const p = process; p.env`, `globalThis["process"].env`,
//    default/namespace/aliased imports of "node:process" followed by `.env`.
//  - import()/require() with a template or computed specifier (e.g. import(`mongo${"db"}`)).
// Only literal specifiers and the direct `process.env` / `globalThis.process.env` /
// `const { env } = process` / `import { env } from "node:process"` forms are enforced.
// ---------------------------------------------------------------------------

const MESSAGES = {
  deep: "Import modules only via their public entry '@/modules/<name>'.",
  relIntoModules: "Use '@/modules/<name>', not relative paths into src/modules.",
  escape: "Relative imports must stay inside the module; use '@/modules/<name>'.",
  flatInternal: "internal/ must be flat; no subdirectories.",
  app: "src/modules/** must not import from src/app/**.",
  mongodb: "Only src/modules/database/** may import 'mongodb'.",
  env: "Only src/modules/config/** may read process.env.",
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

/** R1: no deep imports into a module. */
const DEEP_RE = "^@/modules/[^/]+/.+";
const APP_RE = "^@/app(/|$)";
const MONGODB_RE = "^(mongodb|bson)(/|$)";

/**
 * Selectors for dynamic import() and require() with a literal specifier, which the static
 * `patterns` option of no-restricted-imports does not see. esquery regex literals cannot
 * contain "/", so every slash is written as \x2F.
 */
function dynamicSelectors(re, message) {
  const esq = re.replaceAll("/", "\\x2F");
  return [
    { selector: `ImportExpression[source.value=/${esq}/]`, message },
    { selector: `CallExpression[callee.name='require'][arguments.0.value=/${esq}/]`, message },
  ];
}

const R1_DEEP = {
  patterns: [{ regex: DEEP_RE, message: MESSAGES.deep }],
  syntax: dynamicSelectors(DEEP_RE, MESSAGES.deep),
};
/** R1: no relative paths into src/modules from outside. */
const R1_REL_INTO_MODULES = {
  patterns: [{ regex: "^\\.{1,2}/(.+/)?modules/", message: MESSAGES.relIntoModules }],
};
/** R1: files at a module root may not climb out with ../ */
const R1_ESCAPE_1 = { patterns: [{ regex: "^(\\./)*\\.\\./", message: MESSAGES.escape }] };
/** R1: files in module/internal may not climb out with ../../ */
const R1_ESCAPE_2 = {
  patterns: [{ regex: "^(\\./)*\\.\\./(\\./)*\\.\\./", message: MESSAGES.escape }],
};
/** R1: internal/ is flat. Any file in a subdirectory is an error. */
const R1_FLAT_INTERNAL = { syntax: [{ selector: "Program", message: MESSAGES.flatInternal }] };
/** R2: modules never import the app layer. */
const R2_APP = {
  patterns: [{ regex: APP_RE, message: MESSAGES.app }],
  syntax: dynamicSelectors(APP_RE, MESSAGES.app),
};
/** R3: only database imports mongodb/bson (static, type-only, re-export and dynamic import). */
const R3_MONGODB = {
  patterns: [{ regex: MONGODB_RE, message: MESSAGES.mongodb }],
  syntax: dynamicSelectors(MONGODB_RE, MESSAGES.mongodb),
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
      selector:
        "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
      message: MESSAGES.env,
    },
    {
      selector: "MemberExpression[object.property.name='process'][property.name='env']",
      message: MESSAGES.env,
    },
  ],
};

/** R5a: client code may reach only these module entries (a deep path is R1's job). */
const CLIENT_SERVER_RE = "^@/modules/(?!(validation|wallet-connect)$)[^/]+$";
const CLIENT_NODE_RE = "^node:";
/** R5b: server modules never reach client code. */
const SERVER_CLIENT_RE = "^@/(modules/wallet-connect|ui|components)(/|$)";
/** R5d: ui is the bottom layer. */
const UI_LAYER_RE = "^@/(modules/wallet-connect|components)(/|$)";
const BS58_RE = "^bs58(/|$)";
const NEXT_HEADERS_RE = "^next/headers$";
const NEXT_SERVER_NAV = ["redirect", "permanentRedirect", "notFound", "forbidden", "unauthorized"];

const R5_CLIENT_SERVER = {
  patterns: [{ regex: CLIENT_SERVER_RE, message: MESSAGES.clientServer }],
  syntax: dynamicSelectors(CLIENT_SERVER_RE, MESSAGES.clientServer),
};
const R5_CLIENT_NODE = {
  patterns: [{ regex: CLIENT_NODE_RE, message: MESSAGES.clientNode }],
  syntax: dynamicSelectors(CLIENT_NODE_RE, MESSAGES.clientNode),
};
const R5_SERVER_CLIENT = {
  patterns: [{ regex: SERVER_CLIENT_RE, message: MESSAGES.serverClient }],
  syntax: dynamicSelectors(SERVER_CLIENT_RE, MESSAGES.serverClient),
};
/** R5c: next/headers and next/navigation's server functions only under src/app. */
const R5_NEXT_SERVER = {
  paths: [{ name: "next/navigation", importNames: NEXT_SERVER_NAV, message: MESSAGES.nextServer }],
  patterns: [{ regex: NEXT_HEADERS_RE, message: MESSAGES.nextServer }],
  syntax: dynamicSelectors(NEXT_HEADERS_RE, MESSAGES.nextServer),
};
const R5_UI_LAYER = {
  patterns: [{ regex: UI_LAYER_RE, message: MESSAGES.uiLayer }],
  syntax: dynamicSelectors(UI_LAYER_RE, MESSAGES.uiLayer),
};
/** R5e: wallet-connect never reaches ui or components. */
const WC_UI_RE = "^@/(ui|components)(/|$)";
const R5_WC_UI = {
  patterns: [{ regex: WC_UI_RE, message: MESSAGES.wcUi }],
  syntax: dynamicSelectors(WC_UI_RE, MESSAGES.wcUi),
};
/** R6: bs58 is contained in the two base58.ts files. */
const R6_BS58 = {
  patterns: [{ regex: BS58_RE, message: MESSAGES.bs58 }],
  syntax: dynamicSelectors(BS58_RE, MESSAGES.bs58),
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
const WC = "src/modules/wallet-connect";
/** Modules with their own scopes; excluded from the generic module scopes S7-S9b. */
const SPECIAL_MODULES = ["src/modules/{database,config,wallet-connect}/**"];
/** The two files allowed to import bs58; each has its own scope (S8a, S14a). */
const BS58_FILES = ["src/modules/wallet/internal/base58.ts", `${WC}/internal/base58.ts`];
/** Files under src/modules already claimed by the module root / internal / nested-internal scopes. */
const MODULE_SCOPED_FILES = [
  "src/modules/*/*.{ts,tsx}",
  "src/modules/*/internal/*.{ts,tsx}",
  "src/modules/*/internal/*/**/*.{ts,tsx}",
];
/** Atoms every server module scope adds (S3-S9b). */
const SERVER = [R5_SERVER_CLIENT, R5_NEXT_SERVER, R6_BS58];
/** Atoms every client scope adds (wallet-connect, ui, components). */
const CLIENT = [R5_CLIENT_SERVER, R5_CLIENT_NODE, R5_NEXT_SERVER, R6_BS58];

const boundaryScopes = [
  // S1 app
  scope(
    ["src/app/**/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R6_BS58],
    SRC,
  ),
  // S1b other root src files (instrumentation and proxy have their own scope)
  scope(
    ["src/*.{ts,tsx}"],
    ["src/instrumentation.ts", "src/proxy.ts"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_NEXT_SERVER, R6_BS58],
    SRC,
  ),
  // S2 Next runtime files: process.env allowed
  scope(
    ["src/instrumentation.ts", "src/proxy.ts"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R5_NEXT_SERVER, R6_BS58],
    SRC,
  ),
  // S0 catch-all for any other src file (src/lib, ...): base rules
  scope(
    ["src/**/*.{ts,tsx}"],
    ["src/app/**", "src/*.{ts,tsx}", "src/modules/**", "src/ui/**", "src/components/**"],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_NEXT_SERVER, R6_BS58],
    SRC,
  ),
  // S3/S4 database: mongodb allowed
  scope(
    ["src/modules/database/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/internal/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  // S5/S6 config: process.env allowed
  scope(
    ["src/modules/config/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/internal/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S7/S8 every other server module. These globs cover every server module except database,
  // config and wallet-connect, which have their own scopes. A second scope for the same files
  // would REPLACE these rules (see PITFALL above), not add to them.
  scope(
    ["src/modules/*/*.{ts,tsx}"],
    SPECIAL_MODULES,
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/*/internal/*.{ts,tsx}"],
    [...SPECIAL_MODULES, ...BS58_FILES],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  // S8a wallet/internal/base58.ts: S8 minus R6
  scope(
    ["src/modules/wallet/internal/base58.ts"],
    [],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_SERVER_CLIENT, R5_NEXT_SERVER],
    SRC,
  ),
  // S9 nested internal directories are forbidden outright (and still get the module rules)
  scope(
    ["src/modules/*/internal/*/**/*.{ts,tsx}"],
    SPECIAL_MODULES,
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/internal/*/**/*.{ts,tsx}"],
    [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/internal/*/**/*.{ts,tsx}"],
    [],
    [R1_FLAT_INTERNAL, R1_DEEP, R1_REL_INTO_MODULES, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S9b catch-all for any other file under src/modules (module/lib/x.ts, modules/x.ts, ...):
  // module rules; a depth-1 subdirectory may not climb into another module.
  scope(
    ["src/modules/**/*.{ts,tsx}"],
    [...MODULE_SCOPED_FILES, ...SPECIAL_MODULES],
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/database/**/*.{ts,tsx}"],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R4_ENV, ...SERVER],
    SRC,
  ),
  scope(
    ["src/modules/config/**/*.{ts,tsx}"],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, ...SERVER],
    SRC,
  ),
  // S13/S14/S15/S16 wallet-connect: the client module (S7-S9b shapes, CLIENT atoms instead of SERVER)
  scope(
    [`${WC}/*.{ts,tsx}`],
    [],
    [R1_DEEP, R1_ESCAPE_1, R2_APP, R3_MONGODB, R4_ENV, R5_WC_UI, ...CLIENT],
    SRC,
  ),
  scope(
    [`${WC}/internal/*.{ts,tsx}`],
    [`${WC}/internal/base58.ts`],
    [R1_DEEP, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_WC_UI, ...CLIENT],
    SRC,
  ),
  // S14a wallet-connect/internal/base58.ts: S14 minus R6
  scope(
    [`${WC}/internal/base58.ts`],
    [],
    [
      R1_DEEP,
      R1_ESCAPE_2,
      R2_APP,
      R3_MONGODB,
      R4_ENV,
      R5_WC_UI,
      R5_CLIENT_SERVER,
      R5_CLIENT_NODE,
      R5_NEXT_SERVER,
    ],
    SRC,
  ),
  scope(
    [`${WC}/internal/*/**/*.{ts,tsx}`],
    [],
    [
      R1_FLAT_INTERNAL,
      R1_DEEP,
      R1_REL_INTO_MODULES,
      R2_APP,
      R3_MONGODB,
      R4_ENV,
      R5_WC_UI,
      ...CLIENT,
    ],
    SRC,
  ),
  scope(
    [`${WC}/**/*.{ts,tsx}`],
    MODULE_SCOPED_FILES,
    [R1_DEEP, R1_REL_INTO_MODULES, R1_ESCAPE_2, R2_APP, R3_MONGODB, R4_ENV, R5_WC_UI, ...CLIENT],
    SRC,
  ),
  // S17 ui primitives: client, and the bottom layer
  scope(
    ["src/ui/**/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, R5_UI_LAYER, ...CLIENT],
    SRC,
  ),
  // S18 feature components: client (may use ui and wallet-connect)
  scope(
    ["src/components/**/*.{ts,tsx}"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV, ...CLIENT],
    SRC,
  ),
  // S10 unit tests
  scope(["tests/unit/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S10a component tests (happy-dom)
  scope(["tests/ui/**/*.{ts,tsx}"], [], [R1_DEEP, R1_REL_INTO_MODULES, R3_MONGODB, R4_ENV]),
  // S11 integration tests: mongodb allowed (labelled MongoErrors, ClientSession spies)
  scope(["tests/integration/**/*.ts"], [], [R1_DEEP, R1_REL_INTO_MODULES, R4_ENV]),
  // S12 test setup, helpers and E2E: process.env allowed
  scope(
    ["tests/setup/**/*.{ts,tsx}", "tests/helpers/**/*.{ts,tsx}", "tests/e2e/**/*.ts"],
    [],
    [R1_DEEP, R1_REL_INTO_MODULES],
  ),
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
    "playwright-report/**",
    "test-results/**",
  ]),
  ...nextVitals,
  ...nextTs,
  unusedVars,
  ...boundaryScopes,
  prettier,
]);
