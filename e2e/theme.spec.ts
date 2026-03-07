import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("theme toggle: cycle, persist, and system default", async ({ page }) => {
  await login(page);
  const toggle = page.getByRole("button", { name: /theme/i });

  // Initial: system (no localStorage)
  await expect(toggle).toHaveAttribute("aria-label", "Theme: system");
  expect(
    await page.evaluate(() => localStorage.getItem("ytsub:theme")),
  ).toBeNull();

  // system → light → dark
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "Theme: light");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "Theme: dark");
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Persists across reload
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // dark → system clears localStorage
  await page.getByRole("button", { name: /theme/i }).click();
  await expect(page.getByRole("button", { name: /theme/i })).toHaveAttribute(
    "aria-label",
    "Theme: system",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ytsub:theme")),
  ).toBeNull();
});
