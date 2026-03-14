import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

const fixturePath = path.resolve(
  "scripts/db-seed-json/7GU_VQfgMT0/import.json",
);

test.describe("import file upload", () => {
  test.beforeAll(async () => {
    await setupDb();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("import flow: header menu, preview, import to IndexedDB, video appears in list", async ({
    page,
  }) => {
    // Open import dialog from header menu
    await page.getByTestId("header-menu").click();
    await page.getByText("Import").click();
    await expect(page.getByText("Import Video")).toBeVisible();
    await expect(page.getByTestId("file-input")).toBeAttached();

    // Upload shows preview
    await page.getByTestId("file-input").setInputFiles(fixturePath);
    await expect(page.getByText("cloud palace")).toBeVisible();
    await expect(page.getByText(/\d+ captions/)).toBeVisible();
    await expect(page.getByText(/\d+ bookmarks/)).toBeVisible();

    // Confirm import — dialog closes, video appears in list
    await page
      .locator("[role=dialog], .fixed")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page.getByText("Import Video")).not.toBeVisible();

    // Imported video appears in bookmarks list
    const card = page.getByRole("link", { name: /cloud palace/ });
    await expect(card).toBeVisible();

    // Navigate to viewer — session loaded from IndexedDB
    await card.click();
    await expect(page).toHaveURL(/\/videos\/7GU_VQfgMT0/);

    // Captions are visible
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await expect(
      page
        .locator("[data-index='0']")
        .getByText("꼬집어 봐 뜬 꿈인 것 같아", { exact: false }),
    ).toBeVisible();

    // Bookmarks tab shows imported bookmarks
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]").first()).toBeVisible();
  });
});
