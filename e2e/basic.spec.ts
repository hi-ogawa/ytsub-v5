import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("shows login page when not authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("ytsub — login");
  await expect(page.getByPlaceholder("Password")).toBeVisible();
});

test("login with wrong password shows error", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid password")).toBeVisible();
});

test("login with correct password shows app", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Password").fill("dev");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.locator("h1")).toHaveText("Videos");
});

test.describe("video list and navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("/");
    await page.getByPlaceholder("Password").fill("dev");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.locator("h1")).toHaveText("Videos");
  });

  test("video list page shows video cards", async ({ page }) => {
    const card = page.getByRole("link", {
      name: /한국어 회화 연습 - 일상 대화/,
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("한국어 교실")).toBeVisible();
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("7:00")).toBeVisible();
  });

  test("clicking a video card navigates to viewer", async ({ page }) => {
    await page.getByText("한국어 회화 연습 - 일상 대화").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("h1")).toContainText("Video");
  });

  test("viewer back link returns to video list", async ({ page }) => {
    await page.getByText("한국어 회화 연습 - 일상 대화").click();
    await expect(page.locator("h1")).toContainText("Video");
    await page.getByText("← Back to videos").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toHaveText("Videos");
  });
});
