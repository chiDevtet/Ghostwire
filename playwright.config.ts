import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./tests/e2e/support/origin";

// globalSetup owns Mongo, the build and the server: Playwright starts a webServer BEFORE
// globalSetup, so a webServer could not receive the in-memory replica set's URI.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/support/global-setup.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === "true",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: E2E_ORIGIN, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
