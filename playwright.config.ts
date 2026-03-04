import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  webServer: {
    command: "pnpm dev --port 5190",
    url: "http://localhost:5190",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://localhost:5190",
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
