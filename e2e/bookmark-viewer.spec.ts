import { expect, test } from "@playwright/test";
import { setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test.describe("bookmark viewer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Password").fill("dev");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL("/");
    await page.getByText("cloud palace").click();
    await expect(page).toHaveURL(/\/videos\/\d+/);
    // Wait for captions to load
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("shows tab bar with captions and bookmarks tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Captions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bookmarks/ })).toBeVisible();
    // Bookmark count shown in tab
    await expect(
      page.getByRole("button", { name: /Bookmarks \(\d+\)/ }),
    ).toBeVisible();
  });

  test("shows bookmark indicators on caption rows", async ({ page }) => {
    // Caption at idx=0 has a bookmark (꼬집어) — check for amber dot
    const firstRow = page.locator("[data-index='0']");
    await expect(
      firstRow.locator("span.bg-amber-400.rounded-full"),
    ).toBeVisible();
  });

  test("switches to bookmarks tab and shows bookmark list", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // First bookmark by timestamp should be 꼬집어
    await expect(page.getByText("꼬집어").first()).toBeVisible();
    await expect(page.getByText("to pinch").first()).toBeVisible();
    // Status badges should be visible
    await expect(page.getByText("pending").first()).toBeVisible();
  });

  test("bookmark list shows caption context", async ({ page }) => {
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    // Caption context from idx=0 text1
    await expect(
      page.getByText("꼬집어 봐 뜬 꿈인 것 같아").first(),
    ).toBeVisible();
  });

  test("captions tab preserves scroll after switching tabs", async ({
    page,
  }) => {
    // Captions should be visible initially
    await expect(page.locator("[data-index='0']")).toBeVisible();
    // Switch to bookmarks
    await page.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("꼬집어").first()).toBeVisible();
    // Switch back to captions — should still show content
    await page.getByRole("button", { name: "Captions" }).click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("shows prev/next bookmark navigation buttons", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Previous bookmark" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next bookmark" }),
    ).toBeVisible();
  });
});
