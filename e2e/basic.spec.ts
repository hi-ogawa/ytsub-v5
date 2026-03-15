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

test.describe("video list and navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("video list shows cards and clicking navigates to viewer", async ({
    page,
  }) => {
    const card = page.getByRole("link", {
      name: /cloud palace/,
    });
    await expect(card).toBeVisible();
    const thumbnail = card.locator("img");
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute(
      "src",
      /img\.youtube\.com\/vi\/.+\/mqdefault\.jpg/,
    );
    await expect(card.locator("p", { hasText: "Billlie" })).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/videos\/.+/);
  });

  test("header logo navigates back to video list", async ({ page }) => {
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/.+/);
    await page.getByRole("link", { name: "Zamak" }).click();
    await expect(page).toHaveURL("/");
  });

  test("logout redirects to login", async ({ page }) => {
    // Open header menu and click logout
    await page.getByTestId("header-menu").click();
    await page.getByText("Log out").click();
    await expect(page).toHaveURL("/login");
    // Verify session is cleared by navigating to /
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("shows toast on delete mutation error", async ({ page }) => {
    // Intercept deleteVideo API and return 500
    await page.route("**/api/videos/deleteVideo", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ json: { message: "Server error" } }),
      }),
    );

    const card = page.getByRole("link", { name: /cloud palace/ });
    await expect(card).toBeVisible();

    // Trigger delete (accept confirmation dialog)
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByTestId("video-card-menu").click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();

    // Error toast should appear
    const toast = page.locator("[data-sonner-toast][data-type='error']");
    await expect(toast).toBeVisible();
  });
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
