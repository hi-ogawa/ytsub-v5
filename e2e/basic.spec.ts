import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("video list and navigation", () => {
  test("video list page shows video cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Videos");
    const card = page.getByRole("link", {
      name: /cloud palace/,
    });
    await expect(card).toBeVisible();
    await expect(card.getByText("Billlie")).toBeVisible();
    await expect(card.getByText("ko / en")).toBeVisible();
    await expect(card.getByText("3:30")).toBeVisible();
  });

  test("clicking a video card navigates to viewer", async ({ page }) => {
    await page.goto("/");
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("h1")).toContainText("Video");
  });

  test("viewer back link returns to video list", async ({ page }) => {
    await page.goto("/");
    await page.getByText("cloud palace").click();
    await expect(page.locator("h1")).toContainText("Video");
    await page.getByText("← Back to videos").click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("h1")).toHaveText("Videos");
  });
});
