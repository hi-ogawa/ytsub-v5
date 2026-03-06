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

  test("import dialog opens and shows file picker", async ({ page }) => {
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByText("Import Video")).toBeVisible();
    await expect(page.getByTestId("file-input")).toBeAttached();
  });

  test("uploading import.json shows preview and imports successfully", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByTestId("file-input").setInputFiles(fixturePath);

    // Verify preview
    await expect(page.getByText("cloud palace")).toBeVisible();
    await expect(page.getByText(/\d+ captions/)).toBeVisible();
    await expect(page.getByText(/\d+ bookmarks/)).toBeVisible();

    // Confirm import
    await page
      .locator("[role=dialog], .fixed")
      .getByRole("button", { name: "Import" })
      .click();

    // Should navigate to video viewer
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("imported video appears in video list", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /cloud palace/ }),
    ).toBeVisible();
  });
});
