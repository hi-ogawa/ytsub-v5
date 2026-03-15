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

/** Log in as the seed user (requires setupDb({ seed: true }) beforehand). */
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("dev");
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
