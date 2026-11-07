import net from "node:net";
import { defineConfig, devices } from "@playwright/test";

// Resolve the port once and share it with Playwright workers. Concurrent runs
// from other worktrees must not share a preferred port, or one suite can test
// the other's server.
const port = process.env.E2E_PORT
  ? Number(process.env.E2E_PORT)
  : await getFreePort();
process.env.E2E_PORT = String(port);

const traceEnabled =
  process.env.E2E_TRACE === "1" ||
  (!process.env.CI && process.env.E2E_TRACE !== "0");

export default defineConfig({
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
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
    trace: traceEnabled ? { mode: "on", screenshots: false } : "off",
    ...devices["Desktop Chrome"],
  },
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    ["@hiogawa/playwright-trace-pack/reporter"],
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

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(port);
        }
      });
    });
  });
}
