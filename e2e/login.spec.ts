import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("redirects to /login when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("Log in");
  await expect(page.getByPlaceholder("Username")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("register with short password shows validation error", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.locator("h1")).toHaveText("Sign up");
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
  // Regression: login form must not reappear after successful login
  await expect(page.getByPlaceholder("Username")).not.toBeVisible();
});

test("navigate between login and register", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.locator("h1")).toHaveText("Sign up");

  await page.getByRole("link", { name: "Login" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("Log in");
});
