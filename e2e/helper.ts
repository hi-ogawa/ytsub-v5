import { exec } from "node:child_process";
import { globSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export const execAsync = promisify(exec);

// Write to miniflare's D1 sqlite file directly instead of going through
// wrangler CLI (0.15s vs 2s per call). WAL mode makes this safe while
// the dev server is running.
export async function setupDb(options: { seed?: boolean } = {}) {
  const dbPath = globSync(
    ".wrangler/state/e2e/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
  ).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const sql = options.seed
    ? "scripts/db-clear.sql scripts/db-seed.sql"
    : "scripts/db-clear.sql";
  await execAsync(`cat ${sql} | sqlite3 ${dbPath}`);
}

/** Log in as a seed user (requires setupDb({ seed: true }) beforehand). */
export async function login(page: Page, options?: { username?: string }) {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill(options?.username ?? "dev");
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}

/** Open panel and select ko/en tracks so caption rows appear */
export async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

/** Select text in a caption row (shows FAB but doesn't click) */
export async function selectTextInCaption(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await page.evaluate(
    ({ index, start, end }) => {
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
    },
    { index, start, end },
  );
}

/** Select text in a caption row and create a bookmark */
export async function createBookmarkAt(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await selectTextInCaption(page, index, start, end);
  await page.getByRole("button", { name: "Create bookmark" }).click();
}
