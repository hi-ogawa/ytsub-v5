import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("redirects to /login when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("Zamak — login");
  await expect(page.getByPlaceholder("Username")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("register with short password shows validation error", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.locator("h1")).toHaveText("Zamak — sign up");
  await page.getByPlaceholder("Username").fill("shortpw");
  await page.getByPlaceholder("Password").fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  // Should stay on register page (HTML minLength validation or server rejection)
  await expect(page).toHaveURL("/register");
});

test("register then login as new user", async ({ page }) => {
  await page.goto("/register");
  await page.getByPlaceholder("Username").fill("newuser");
  await page.getByPlaceholder("Password").fill("newpassword");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/");
  // New user should see empty bookmarks page
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

  // Logout
  await page.getByTestId("header-menu").click();
  await page.getByText("Log out").click();
  await expect(page).toHaveURL("/login");

  // Login again with same credentials
  await page.getByPlaceholder("Username").fill("newuser");
  await page.getByPlaceholder("Password").fill("newpassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
});

test("register duplicate username shows error", async ({ page }) => {
  await page.goto("/register");
  // "dev" already exists from seed
  await page.getByPlaceholder("Username").fill("dev");
  await page.getByPlaceholder("Password").fill("somepassword");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("Registration failed")).toBeVisible();
});

test("login with wrong then correct password", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("dev");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
  // Login errors use inline message, not global toast
  await expect(
    page.locator("[data-sonner-toast][data-type='error']"),
  ).not.toBeVisible();

  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("Bookmarked Videos");
});

test("navigate between login and register", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.locator("h1")).toHaveText("Zamak — sign up");

  await page.getByRole("link", { name: "Login" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("Zamak — login");
});

test("header logo navigates back, logout redirects to login", async ({
  page,
}) => {
  await login(page);

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
  await login(page);

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

test("video-viewer settings dropdown and track label", async ({ page }) => {
  await login(page);

  // Pull seed data to IndexedDB via video-list sync badge
  const badge = page
    .getByTestId("video-card-7GU_VQfgMT0")
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");

  // Navigate to video viewer
  await page.getByTestId("video-card-7GU_VQfgMT0").click();
  await expect(page).toHaveURL("/videos/7GU_VQfgMT0");

  // Track label shows language codes
  await expect(page.getByText("Korean · English")).toBeVisible();

  // Settings dropdown opens and has auto-scroll toggle
  await page.getByTitle("Settings").click();
  await expect(page.getByText("Auto-scroll")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toBeVisible();

  // Track alignment select is NOT shown in sessionOnly mode
  await expect(
    page.locator("select[title='Alignment strategy']"),
  ).not.toBeVisible();
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
