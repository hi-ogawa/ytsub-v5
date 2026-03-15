import { exec } from "node:child_process";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export const execAsync = promisify(exec);

export async function setupDb(options: { seed?: boolean } = {}) {
  await execAsync(`pnpm db:clear --persist-to .wrangler/state/e2e`);
  if (options.seed) {
    await execAsync(`pnpm db:seed --persist-to .wrangler/state/e2e`);
  }
}

/**
 * Log in via the UI.
 * When seed data is loaded, logs in as the seed user (dev / devpassword).
 * Otherwise registers a fresh test user.
 */
export async function login(
  page: Page,
  opts?: { username?: string; password?: string },
) {
  const username = opts?.username ?? "dev";
  const password = opts?.password ?? "devpassword";

  await page.goto("/login");
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();

  // If login fails (no seed user), register instead
  const nav = page.waitForURL("/", { timeout: 3000 }).catch(() => null);
  const err = page
    .getByText("Invalid username or password")
    .waitFor({ timeout: 3000 })
    .catch(() => null);

  const result = await Promise.race([
    nav.then(() => "ok" as const),
    err.then(() => "error" as const),
  ]);

  if (result === "error") {
    await page.goto("/register");
    await page.getByPlaceholder("Username").fill(username);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
  }

  await expect(page).toHaveURL("/");
}

export const FIXTURE_VIDEO_ID = "7GU_VQfgMT0";

/** Open panel and select ko/en tracks so caption rows appear */
export async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

/** Select text in a caption row and create a bookmark */
export async function createBookmarkAt(
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
  await page.getByRole("button", { name: "Create bookmark" }).click();
}
