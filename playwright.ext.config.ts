import { defineConfig } from "@playwright/test";

// Separate config for extension tests.
// Requires `pnpm build-ext` before running.
// Tests use chromium.launchPersistentContext() to side-load the extension.
export default defineConfig({
  testDir: "./e2e-ext",
  workers: 1,
  globalSetup: "./e2e-ext/global-setup.ts",
  webServer: {
    command: "pnpm dev --port 5191",
    url: "http://localhost:5191",
    reuseExistingServer: false,
    env: {
      APP_PERSIST_TO: ".wrangler/state/e2e-ext",
    },
  },
  expect: {
    timeout: 10_000,
  },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
