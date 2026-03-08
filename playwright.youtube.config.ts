import { defineConfig, devices } from "@playwright/test";

// Separate config for YouTube extraction tests.
// No web server — these tests run against real YouTube pages.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "youtube-*.spec.ts",
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    ...devices["Desktop Chrome"],
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
});
