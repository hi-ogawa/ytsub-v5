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

  test("import flow: dialog, preview, import, and video list", async ({
    page,
  }) => {
    // Dialog opens with file picker
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByText("Import Video")).toBeVisible();
    await expect(page.getByTestId("file-input")).toBeAttached();

    // Upload shows preview
    await page.getByTestId("file-input").setInputFiles(fixturePath);
    await expect(page.getByText("cloud palace")).toBeVisible();
    await expect(page.getByText(/\d+ captions/)).toBeVisible();
    await expect(page.getByText(/\d+ bookmarks/)).toBeVisible();

    // Confirm import navigates to viewer
    await page
      .locator("[role=dialog], .fixed")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Imported video appears in list with valid date
    await page.getByRole("link", { name: "ytsub" }).click();
    await expect(page).toHaveURL("/");
    const card = page.getByRole("link", { name: /cloud palace/ });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("Invalid date");
    await expect(card.getByText(/\w{3} \d{1,2}, \d{4}/)).toBeVisible();
  });

  test("import preserves etymology in bookmarks", async ({ page }) => {
    // Import the fixture
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByTestId("file-input").setInputFiles(fixturePath);
    await page
      .locator("[role=dialog], .fixed")
      .getByRole("button", { name: "Import" })
      .click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Check etymology in bookmark list
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("迷路").first()).toBeVisible();

    // Check etymology in popover (미로 is on caption idx=13)
    await page.getByRole("button", { name: "Captions" }).click();
    const row = page.locator("[data-index='13']");
    await row.scrollIntoViewIfNeeded();
    const highlight = row.locator("span.border-highlight-alt-border").first();
    await highlight.click({ force: true });
    await expect(page.getByText("迷路")).toBeVisible();
  });
});
