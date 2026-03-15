import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: `pnpm dev --port 5190`,
    url: "http://localhost:5190",
    reuseExistingServer: false,
    env: {
      APP_PERSIST_TO: ".wrangler/state/e2e",
    },
  },
  expect: {
    timeout: 2000,
  },
  use: {
    baseURL: "http://localhost:5190",
    actionTimeout: 2000,
    ...devices["Desktop Chrome"],
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    {
      name: "app",
      testDir: "./e2e",
      testIgnore: ["e2e/ext/**", "e2e/youtube/**"],
    },
    {
      name: "ext",
      testDir: "./e2e/ext",
    },
  ],
});
