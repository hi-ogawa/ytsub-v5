import { expect, test } from "@playwright/test";
import { login } from "./helper.ts";

test.describe("dev-viewer caption panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/youtube/7GU_VQfgMT0");
  });

  test("FAB toggles caption panel open and closed", async ({ page }) => {
    // Panel starts closed — no caption rows visible
    await expect(page.locator("[data-index='0']")).not.toBeVisible();

    // Open panel via FAB
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Close panel via FAB
    await page.getByTitle("Hide captions").click();
    await expect(page.locator("[data-index='0']")).not.toBeVisible();
  });

  test("panel shows merged caption rows from fixture data", async ({
    page,
  }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Multiple rows rendered (fixture has many cues)
    await expect(page.locator("[data-index='5']")).toBeVisible();
  });

  test("defaults to ko/en language pair", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Track pickers: first select = ko, second select = en
    const selects = page.locator("select");
    await expect(selects.nth(0)).toHaveValue(".ko");
    await expect(selects.nth(1)).toHaveValue(".en");
  });

  test("switching language reloads captions", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Grab initial text from first row
    const firstRowText = await page.locator("[data-index='0']").textContent();

    // Switch lang2 from en to ja
    await page.locator("select").nth(1).selectOption(".ja");

    // Wait for captions to reload — text should change
    await expect(page.locator("[data-index='0']")).not.toHaveText(
      firstRowText!,
    );
  });

  test("panel left edge can be dragged to resize", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // The ResizablePanel wrapper — fixed-position panel
    const panel = page.locator(".fixed.flex.flex-col").first();
    const initialBox = (await panel.boundingBox())!;
    expect(initialBox.width).toBe(400);

    // Drag handle is the leftmost 6px strip
    const handle = panel.locator(".cursor-col-resize");
    const handleBox = (await handle.boundingBox())!;

    // Drag left edge 100px to the left → panel should widen
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 100, startY, { steps: 5 });
    await page.mouse.up();

    const newBox = (await panel.boundingBox())!;
    expect(newBox.width).toBe(500);

    // Width persists after closing and reopening
    await page.getByTitle("Hide captions").click();
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const reopenedBox = (await panel.boundingBox())!;
    expect(reopenedBox.width).toBe(500);
  });

  test("caption rows show timestamp and dual-column text", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    const row = page.locator("[data-index='0']");

    // Timestamp format: m:ss – m:ss
    await expect(row.locator("text=/\\d+:\\d{2} – \\d+:\\d{2}/")).toBeVisible();

    // Two text columns (border-r separates them)
    const cols = row.locator(".flex-1");
    await expect(cols).toHaveCount(2);
    // Both columns should have text content
    await expect(cols.nth(0)).not.toHaveText("");
    await expect(cols.nth(1)).not.toHaveText("");
  });
});
