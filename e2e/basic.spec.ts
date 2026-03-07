import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("redirects to /login when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("ytsub — login");
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("login with wrong then correct password", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid password")).toBeVisible();

  await page.getByPlaceholder("Password").fill("dev");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("Videos");
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
    await page.getByRole("link", { name: "ytsub" }).click();
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
