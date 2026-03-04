import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("redirects to /login when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.locator("h1")).toHaveText("ytsub — login");
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("login with wrong password shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid password")).toBeVisible();
});

test("login with correct password redirects to /", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Password").fill("dev");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toHaveText("Videos");
});

test.describe("video list and navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Password").fill("dev");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL("/");
  });

  test("video list page shows video cards", async ({ page }) => {
    const card = page.getByRole("link", {
      name: /cloud palace/,
    });
    await expect(card).toBeVisible();
    await expect(card.locator("p", { hasText: "Billlie" })).toBeVisible();
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("3:30")).toBeVisible();
  });

  test("clicking a video card navigates to viewer", async ({ page }) => {
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("h1")).toContainText("Video");
  });

  test("viewer back link returns to video list", async ({ page }) => {
    await page.getByText("cloud palace").click();
    await expect(page.locator("h1")).toContainText("Video");
    await page.getByText("← Back to videos").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toHaveText("Videos");
  });
});
