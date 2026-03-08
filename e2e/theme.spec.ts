import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("theme toggle: cycle, persist, and system default", async ({ page }) => {
  await login(page);
  const menu = page.getByTestId("header-menu");
  const theme = page.getByTestId("theme-toggle");

  // Open menu — initial: system (no localStorage)
  await menu.click();
  await expect(theme).toHaveAttribute("data-theme", "system");
  await expect(theme).toHaveText(/system/i);
  expect(
    await page.evaluate(() => localStorage.getItem("zamak:theme")),
  ).toBeNull();

  // system → light → dark (dropdown stays open)
  await theme.click();
  await expect(theme).toHaveAttribute("data-theme", "light");
  await theme.click();
  await expect(theme).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Persists across reload
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // dark → system clears localStorage
  await menu.click();
  await theme.click();
  await expect(theme).toHaveAttribute("data-theme", "system");
  expect(
    await page.evaluate(() => localStorage.getItem("zamak:theme")),
  ).toBeNull();
});
