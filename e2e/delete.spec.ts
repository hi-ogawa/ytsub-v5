import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

const fixturePath = path.resolve(
  "scripts/db-seed-json/7GU_VQfgMT0/import.json",
);

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

    const menuTrigger = card.getByTestId("video-card-menu");
    page.once("dialog", (dialog) => dialog.dismiss());
    await menuTrigger.click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(card).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await menuTrigger.click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await expect(card).not.toBeVisible();
  });
});

test.describe("delete bookmark", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("delete bookmark from viewer after import", async ({ page }) => {
    // Import fixture with bookmarks into IndexedDB
    await page.getByTestId("header-menu").click();
    await page.getByText("Import").click();
    await page.getByTestId("file-input").setInputFiles(fixturePath);
    await page
      .locator("[role=dialog], .fixed")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page.getByText("Import Video")).not.toBeVisible();

    // Navigate to viewer
    await page.getByRole("link", { name: /cloud palace/ }).click();
    await expect(page).toHaveURL(/\/videos\/7GU_VQfgMT0/);

    // Switch to bookmarks tab — bookmarks from import are visible
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    const bookmarkCards = page.locator("[data-bookmark-id]");
    await expect(bookmarkCards.first()).toBeVisible();
    const countBefore = await bookmarkCards.count();

    // Delete the first bookmark
    page.on("dialog", (d) => d.accept());
    await bookmarkCards
      .first()
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // One fewer bookmark
    await expect(bookmarkCards).toHaveCount(countBefore - 1);
  });
});
