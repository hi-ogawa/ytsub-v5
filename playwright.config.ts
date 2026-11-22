import net from "node:net";
import os from "node:os";
import { defineConfig, devices } from "@playwright/test";

const server = process.env.E2E_SERVER ?? "build";
if (server !== "build" && server !== "dev") {
  throw new Error(`Invalid E2E_SERVER: ${server}. Expected build or dev.`);
}

// Resolve the port once and share it with Playwright workers. The server binds
// it only after the build, and Playwright accepts any server that answers on it
// by then, so concurrent runs from other worktrees must not share a preferred port.
const port = process.env.E2E_PORT
  ? Number(process.env.E2E_PORT)
  : await getFreePort();
process.env.E2E_PORT = String(port);

const traceEnabled =
  process.env.E2E_TRACE === "1" ||
  (!process.env.CI && process.env.E2E_TRACE !== "0");

export default defineConfig({
  // Each test logs in as a user of its own (see createUser in e2e/helper.ts),
  // so tests never share server data and all of them run in parallel.
  fullyParallel: true,
  // Leave one CPU for the server. On CI's 4 vCPUs, 3 workers ran fastest,
  // because Chromium and the server compete for the CPUs.
  workers: Math.max(1, os.availableParallelism() - 1),
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command:
      server === "dev"
        ? `pnpm dev --port ${port} --strictPort`
        : `pnpm build && pnpm preview --port ${port} --strictPort`,
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
    channel: "chromium",
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
