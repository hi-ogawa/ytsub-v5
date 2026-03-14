import { defineConfig } from "@playwright/test";

// Separate config for extension smoke tests.
// Requires `pnpm build-ext` before running.
// Tests use chromium.launchPersistentContext() to side-load the extension.
export default defineConfig({
  testDir: "./e2e-ext",
  workers: 1,
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
