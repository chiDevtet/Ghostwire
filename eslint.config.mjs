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
