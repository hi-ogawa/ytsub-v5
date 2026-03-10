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
  // New user should see empty video list
  await expect(page.getByText("No videos yet.")).toBeVisible();

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

  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("Videos");
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
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("3:30")).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("header logo navigates back to video list", async ({ page }) => {
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
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
});
