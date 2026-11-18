import { exec } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { test as baseTest, expect, type Page } from "@playwright/test";
import { mockYouTubePlayer } from "./youtube-player-mock.ts";

export const test = baseTest.extend({
  context: async ({ context }, use) => {
    await mockYouTubePlayer(context);
    await use(context);
  },
});

export const execAsync = promisify(exec);

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

/** Open panel and select ko/en tracks so caption rows appear */
export async function openPanelWithTracks(page: Page) {
  await test.step(
    "Open panel with tracks",
    async () => {
      await page.getByTitle("Show captions").click();
      const selects = page.locator("select");
      await selects.nth(0).selectOption(".ko");
      await selects.nth(1).selectOption(".en");
      await expect(page.locator("[data-index='0']")).toBeVisible();
    },
    { box: true },
  );
}

interface CaptionSelection {
  index: number;
  start: number;
  end: number;
}

/** Select text in a caption row (shows FAB but doesn't click) */
export async function selectTextInCaption(
  page: Page,
  options: CaptionSelection,
) {
  await test.step(
    "Select caption text",
    async () => {
      await page.evaluate(({ index, start, end }) => {
        const sideEl = document
          .querySelector(`[data-index='${index}']`)!
          .querySelector("[data-side='0']")!;
        const textSpan = sideEl.querySelector("[data-offset]")!;
        const textNode = textSpan.firstChild!;
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const selection = document.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      }, options);
    },
    { box: true },
  );
}

/** Select text in a caption row and create a bookmark */
export async function createBookmarkAt(page: Page, options: CaptionSelection) {
  await test.step(
    "Create bookmark",
    async () => {
      await selectTextInCaption(page, options);
      await page.getByRole("button", { name: "Create bookmark" }).click();
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
