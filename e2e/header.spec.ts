import { expect, test } from "@playwright/test";
import { createUser, login } from "./helper.ts";

test("header logo navigates back, logout redirects to login", async ({
  page,
}) => {
  const username = await createUser({ seed: true });
  await login(page, { username });

  // Logo navigates back to video list
  await page.getByText("cloud palace").click();
  await expect(page).toHaveURL(/\/videos\/.+/);
  await page.getByRole("link", { name: "Zamak" }).click();
  await expect(page).toHaveURL("/");

  // Logout redirects to login
  await page.getByTestId("header-menu").click();
  await page.getByText("Log out").click();
  await expect(page).toHaveURL("/login");
  // Session is cleared — navigating to / redirects back
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("shows toast on mutation error", async ({ page }) => {
  const username = await createUser({ seed: true });
  await login(page, { username });

  // Intercept logout API and return 500
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ json: { message: "Server error" } }),
    }),
  );

  // Trigger logout
  await page.getByTestId("header-menu").click();
  await page.getByText("Log out").click();

  // Error toast should appear
  const toast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(toast).toBeVisible();
});

test("theme toggle: cycle, persist, and system default", async ({ page }) => {
  await page.goto("/");
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
