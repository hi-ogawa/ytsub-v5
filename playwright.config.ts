import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
