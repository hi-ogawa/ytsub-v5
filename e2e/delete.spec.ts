import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("delete video", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("cancel then confirm delete video", async ({ page }) => {
    const card = page.getByRole("link", { name: /cloud palace/ });
    await expect(card).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await card.getByRole("button").click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(card).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button").click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(card).not.toBeVisible();
  });
});

test.describe("delete bookmark", () => {
  test.beforeAll(async () => {
    // Re-seed since previous test may have deleted the video
    await setupDb({ seed: true });
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await page.getByRole("button", { name: /Bookmarks/ }).click();
  });

  test("cancel then confirm delete bookmark", async ({ page }) => {
    const bookmarkRow = page
      .locator("div.flex.cursor-pointer")
      .filter({ hasText: "꼬집어" })
      .first();
    await expect(bookmarkRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.dismiss());
    await bookmarkRow.getByRole("button").first().click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(bookmarkRow).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await bookmarkRow.getByRole("button").first().click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(bookmarkRow).not.toBeVisible();
  });
});
