import { exec } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { expect, type Page, test } from "@playwright/test";

export const execAsync = promisify(exec);

/**
 * Billlie's "cloud palace", which has manual ko and en subtitles. It is the one
 * video in both the YouTube fixtures (`scripts/youtube-json`) and the server
 * seed (`scripts/db-seed-json`, owned by the "dev" user).
 */
export const SEED_VIDEO_ID = "7GU_VQfgMT0";

// Write to miniflare's D1 sqlite file directly instead of going through
// wrangler CLI (0.15s vs 2s per call). WAL mode lets this run alongside the
// dev server, but writers still take turns, so `.timeout` waits out a write
// the server is still finishing instead of failing with "database is locked".
// The timeout is only an upper bound; sqlite3 proceeds as soon as the lock frees.
export async function setupDb(options: { seed?: boolean } = {}) {
  const sql = options.seed
    ? "scripts/db-clear.sql scripts/db-seed.sql"
    : "scripts/db-clear.sql";
  await execAsync(`cat ${sql} | sqlite3 -cmd ".timeout 5000" ${findDbPath()}`);
}

/** Bump a video's updated_at to a future time, simulating a push from another device. */
export async function bumpServerUpdatedAt(youtubeId: string) {
  await execAsync(
    `sqlite3 -cmd ".timeout 5000" ${findDbPath()} "UPDATE videos SET updated_at = datetime('now', '+1 hour') WHERE youtube_id = '${youtubeId}'"`,
  );
}

function findDbPath() {
  return globSync(
    ".wrangler/state/e2e/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
  ).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

/** Log in as a seed user (requires setupDb({ seed: true }) beforehand). */
export async function login(page: Page, options?: { username?: string }) {
  await test.step(
    "Log in",
    async () => {
      await page.goto("/login");
      await page.getByPlaceholder("Username").fill(options?.username ?? "dev");
      await page.getByPlaceholder("Password").fill("devpassword");
      await page.getByRole("button", { name: "Login" }).click();
      await expect(page).toHaveURL("/");
    },
    { box: true },
  );
}

/**
 * Log in as the seed user, pull the seed video from its sync badge, and open
 * it in the viewer. Requires setupDb({ seed: true }) beforehand.
 */
export async function openPulledVideo(page: Page, youtubeId: string) {
  await test.step(
    "Open pulled video",
    async () => {
      // No test checks playback, so keep the YouTube player off the network
      await page.route("https://www.youtube.com/**", (route) => route.abort());
      await login(page);
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
