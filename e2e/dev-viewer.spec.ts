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

  test("settings menu opens and closes", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Open settings menu
    await page.getByTitle("Settings").click();
    await expect(page.getByText("Auto-scroll")).toBeVisible();

    // Close by pressing Escape
    await page.keyboard.press("Escape");
    await expect(page.getByText("Auto-scroll")).not.toBeVisible();
  });

  test("auto-scroll toggle via settings menu", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Auto-scroll defaults to on
    let stored = await page.evaluate(() =>
      localStorage.getItem("zamak:auto-scroll"),
    );
    expect(stored).toBeNull(); // default = true, not yet stored

    // Open settings menu and toggle auto-scroll off (menu stays open)
    await page.getByTitle("Settings").click();
    await page.getByText("Auto-scroll").click();

    // Verify localStorage updated
    stored = await page.evaluate(() =>
      localStorage.getItem("zamak:auto-scroll"),
    );
    expect(stored).toBe("false");

    // Toggle back on
    await page.getByText("Auto-scroll").click();
    stored = await page.evaluate(() =>
      localStorage.getItem("zamak:auto-scroll"),
    );
    expect(stored).toBe("true");
  });

  test("strategy dropdown switches merge strategy", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Open settings menu to access strategy select
    await page.getByTitle("Settings").click();
    const strategySelect = page.locator("select[title='Alignment strategy']");
    await expect(strategySelect).toBeVisible();
    await expect(strategySelect).toHaveValue("partition");

    // Count rows with partition strategy (default)
    // Close menu first to count rows
    await page.keyboard.press("Escape");
    const partitionCount = await page.locator("[data-index]").count();

    // Reopen and switch to overlap — should produce more rows
    await page.getByTitle("Settings").click();
    await strategySelect.selectOption("overlap");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const overlapCount = await page.locator("[data-index]").count();
    expect(overlapCount).toBeGreaterThan(partitionCount);

    // Switch to best-overlap
    await page.getByTitle("Settings").click();
    await page
      .locator("select[title='Alignment strategy']")
      .selectOption("best-overlap");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("export downloads valid import.json", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Open settings menu and click export
    await page.getByTitle("Settings").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Export import.json").click(),
    ]);

    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/^import-.*\.json$/);

    // Read and validate exported JSON
    const content = await (
      await download.createReadStream()
    )
      .toArray()
      .then((chunks) => Buffer.concat(chunks).toString());
    const data = JSON.parse(content);

    // Must match importVideo schema shape
    expect(data.video).toBeDefined();
    expect(data.video.youtubeId).toBeTruthy();
    expect(data.video.title).toBeTruthy();
    expect(data.captions).toBeInstanceOf(Array);
    expect(data.captions.length).toBeGreaterThan(0);
    expect(data.captions[0]).toHaveProperty("idx");
    expect(data.captions[0]).toHaveProperty("begin");
    expect(data.captions[0]).toHaveProperty("end");
    expect(data.captions[0]).toHaveProperty("text1");
    expect(data.captions[0]).toHaveProperty("text2");
    expect(data.bookmarks).toEqual([]);
  });

  test("panel left edge can be dragged to resize", async ({ page }) => {
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();

    const panel = page.getByTestId("resizable-panel");
    const initialBox = (await panel.boundingBox())!;
    expect(initialBox.width).toBe(400);

    const handle = page.getByTestId("resize-handle");
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
