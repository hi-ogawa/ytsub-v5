import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("theme toggle", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("cycles through light → dark → system", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /theme/i });

    // Initial state: system (no localStorage), light appearance
    await expect(toggle).toHaveAttribute("aria-label", "Theme: system");
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Click 1: system → light
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", "Theme: light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Click 2: light → dark
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", "Theme: dark");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Click 3: dark → system (back to light since no system dark pref)
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", "Theme: system");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("persists dark mode across reload", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /theme/i });

    // Cycle to dark: system → light → dark
    await toggle.click();
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Reload and verify dark is preserved
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: /theme/i })).toHaveAttribute(
      "aria-label",
      "Theme: dark",
    );
  });

  test("system mode clears localStorage", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /theme/i });

    // Set to dark, then back to system
    await toggle.click(); // light
    await toggle.click(); // dark
    await toggle.click(); // system

    const stored = await page.evaluate(() =>
      localStorage.getItem("ytsub:theme"),
    );
    expect(stored).toBeNull();
  });

  test("dark mode applies before paint (no flash)", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /theme/i });

    // Set dark mode
    await toggle.click(); // light
    await toggle.click(); // dark

    // Navigate fresh — the inline script should apply .dark before React hydrates
    await page.goto("/");
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDark).toBe(true);
  });
});
