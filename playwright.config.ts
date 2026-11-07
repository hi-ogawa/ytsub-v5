import net from "node:net";
import { defineConfig, devices } from "@playwright/test";

function getFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      // preferred port in use, let OS pick a free one
      const fallback = net.createServer();
      fallback.listen(0, () => {
        const port = (fallback.address() as net.AddressInfo).port;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferred, () => {
      server.close(() => resolve(preferred));
    });
  });
}

// Main process resolves port and passes it to workers via env var
const port = process.env.E2E_PORT
  ? Number(process.env.E2E_PORT)
  : await getFreePort(5190);
process.env.E2E_PORT = String(port);

export default defineConfig({
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      APP_PERSIST_TO: ".wrangler/state/e2e",
    },
  },
  expect: {
    timeout: 2000,
  },
  use: {
    baseURL: `http://localhost:${port}`,
    actionTimeout: 2000,
    ...devices["Desktop Chrome"],
    channel: "chromium",
  },
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
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
