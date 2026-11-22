import net from "node:net";
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

// These specs never touch the database, so their tests run in parallel. The
// other specs share one local D1 database that setupDb() clears, so the db
// project runs them one at a time.
const noDbSpecs = [
  "e2e/ext/caption-panel.spec.ts",
  "e2e/ext/caption-panel-bookmarks.spec.ts",
  "e2e/ext/caption-panel-ai-prompts.spec.ts",
];

export default defineConfig({
  // One worker runs the db project and the other the no-db tests. More workers
  // don't shorten the run, because the serial db project sets its length.
  workers: 2,
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
      name: "db",
      testDir: "./e2e",
      testIgnore: ["e2e/youtube/**", ...noDbSpecs],
      workers: 1,
    },
    {
      name: "no-db",
      testDir: "./e2e",
      testMatch: noDbSpecs,
      fullyParallel: true,
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
