import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
  use: {
    baseURL: "http://localhost:5190",
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    {
      name: "auth",
      testMatch: "auth.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "setup",
      testMatch: "setup.ts",
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth.json",
      },
      dependencies: ["setup"],
      testIgnore: ["auth.spec.ts", "setup.ts"],
    },
  ],
});
