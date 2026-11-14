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
      exclude: ["src/app/**/*.tsx", "src/app/fonts.ts", "src/proxy.ts", "src/modules/*/index.ts"],
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
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["tests/ui/**/*.test.tsx"],
          setupFiles: ["tests/setup/ui.setup.ts"],
          testTimeout: 10_000,
        },
      },
    ],
  },
});
