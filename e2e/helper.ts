import { exec, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { globSync, readdirSync, readFileSync, statSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import {
  type APIRequestContext,
  expect,
  type Page,
  request,
  test,
} from "@playwright/test";

export const execAsync = promisify(exec);

/**
 * Billlie's "cloud palace", which has manual ko and en subtitles. It is in both
 * the YouTube fixtures (`scripts/youtube-json`) and the server seed
 * (`scripts/db-seed-json`, which `createUser({ seed: true })` inserts), so a test can open it in
 * the extension and pull it from the server.
 */
export const SEED_YOUTUBE_ID = "7GU_VQfgMT0";

/** A second video in both the YouTube fixtures and the server seed */
export const OTHER_YOUTUBE_ID = "DtK-CkwNHSY";

/** The password of every user that createUser() makes */
export const TEST_PASSWORD = "devpassword";

/** A username that no other test uses, so tests running in parallel never share server data */
export function createUsername(): string {
  return `e2e-${randomUUID().slice(0, 8)}`;
}

/**
 * Create a user that only the calling test uses, and return its username. With
 * `seed`, the user owns the seed videos in `scripts/db-seed-json`. This goes
 * through the server's API, because tests run alongside each other and the
 * server can't share the database with another writer (see runSql).
 */
export async function createUser(
  options: { seed?: boolean } = {},
): Promise<string> {
  const username = createUsername();
  await withApi(async (api) => {
    await callApi(api, "auth/register", { username, password: TEST_PASSWORD });
    if (options.seed) {
      for (const youtubeId of SEED_YOUTUBE_IDS) {
        await callApi(api, "videos/importVideo", readSeedImport(youtubeId));
      }
    }
  });
  return username;
}

/** Push a seed video from another device, so the server copy is newer than the last sync */
export async function pushFromAnotherDevice(options: {
  username: string;
  youtubeId: string;
}) {
  // The server stores updated_at in whole seconds, so a push within the same
  // second as the last sync would look unchanged.
  await setTimeout(1000);
  await withApi(async (api) => {
    await callApi(api, "auth/login", {
      username: options.username,
      password: TEST_PASSWORD,
    });
    await callApi(api, "videos/importVideo", readSeedImport(options.youtubeId));
  });
}

async function withApi(fn: (api: APIRequestContext) => Promise<void>) {
  const api = await request.newContext({
    baseURL: `http://localhost:${process.env.E2E_PORT}`,
    // Test setup, not a UI step, so it doesn't share the 2s action timeout
    timeout: 10_000,
  });
  try {
    await fn(api);
  } finally {
    await api.dispose();
  }
}

async function callApi(api: APIRequestContext, path: string, input: unknown) {
  const res = await api.post(`/api/${path}`, { data: { json: input } });
  if (!res.ok()) {
    throw new Error(`${path} failed: ${res.status()} ${await res.text()}`);
  }
}

const SEED_YOUTUBE_IDS = readdirSync("scripts/db-seed-json");

function readSeedImport(youtubeId: string): unknown {
  return JSON.parse(
    readFileSync(`scripts/db-seed-json/${youtubeId}/import.json`, "utf-8"),
  );
}

/** Delete every row, so the local e2e database doesn't grow across runs */
export async function clearDb() {
  await runSql(readFileSync("scripts/db-clear.sql", "utf-8"));
}

// Write to miniflare's D1 sqlite file directly instead of going through
// wrangler CLI (0.15s vs 2s per call). Only run this while no test is running,
// because the server fails a write with SQLITE_BUSY instead of waiting for
// another process's lock.
async function runSql(sql: string) {
  const child = spawn("sqlite3", ["-cmd", ".timeout 5000", findDbPath()], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  child.stdin.end(sql);
  const [code] = await once(child, "close");
  if (code !== 0) {
    throw new Error(`sqlite3 exited with code ${code}`);
  }
}

function findDbPath() {
  return globSync(
    ".wrangler/state/e2e/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
  ).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Log in as a user from createUser() */
export async function login(page: Page, options: { username: string }) {
  await test.step(
    "Log in",
    async () => {
      await page.goto("/login");
      await page.getByPlaceholder("Username").fill(options.username);
      await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Login" }).click();
      await expect(page).toHaveURL("/");
    },
    { box: true },
  );
}

/**
 * Log in as a user from createUser({ seed: true }), pull a seed video from its
 * sync badge, and open it in the viewer.
 */
export async function openPulledVideo(
  page: Page,
  options: { username: string; youtubeId: string },
) {
  const { username, youtubeId } = options;
  await test.step(
    "Open pulled video",
    async () => {
      // No test checks playback, so keep the YouTube player off the network
      await page.route("https://www.youtube.com/**", (route) => route.abort());
      await login(page, { username });
      const card = page.getByTestId(`video-card-${youtubeId}`);
      const badge = card.getByTestId("video-sync-badge");
      await badge.click();
      await expect(badge).toHaveAttribute("data-sync-status", "synced");
      await card.click();
      await expect(page).toHaveURL(`/videos/${youtubeId}`);
    },
    { box: true },
  );
}

/** Log elapsed checkpoints while investigating E2E timing. */
export function createCheckpoint(): (label: string) => void {
  const startedAt = performance.now();
  return (label) => {
    console.log(`[${Math.round(performance.now() - startedAt)}ms] ${label}`);
  };
}
