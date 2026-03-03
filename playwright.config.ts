import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "wrangler d1 migrations apply DB --local && pnpm dev --port 5190",
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
