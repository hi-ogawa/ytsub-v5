import { expect, type Page, test } from "@playwright/test";
import { login } from "./helper.ts";

/** Open panel and select ko/en tracks so caption rows appear */
async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

test.describe("dev-viewer caption panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dev/youtube/7GU_VQfgMT0");
  });

  test("FAB toggles caption panel open and closed", async ({ page }) => {
    // Panel starts closed — no caption rows visible
    await expect(page.locator("[data-index='0']")).not.toBeVisible();

    // Open panel and select tracks
    await openPanelWithTracks(page);

    // Close panel via FAB
    await page.getByTitle("Hide captions").click();
    await expect(page.locator("[data-index='0']")).not.toBeVisible();
  });

  test("panel shows merged caption rows from fixture data", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Multiple rows rendered (fixture has many cues)
    await expect(page.locator("[data-index='5']")).toBeVisible();
  });

  test("no tracks selected by default without preference", async ({ page }) => {
    await page.getByTitle("Show captions").click();

    // Track pickers default to "None"
    const selects = page.locator("select");
    await expect(selects.nth(0)).toHaveValue("");
    await expect(selects.nth(1)).toHaveValue("");

    // No caption rows rendered
    await expect(page.locator("[data-index='0']")).not.toBeVisible();
  });

  test("switching language reloads captions", async ({ page }) => {
    await openPanelWithTracks(page);

    // Grab initial text from first row
    const firstRowText = await page.locator("[data-index='0']").textContent();

    // Switch lang2 from en to ja
    await page.locator("select").nth(1).selectOption(".ja");

    // Wait for captions to reload — text should change
    await expect(page.locator("[data-index='0']")).not.toHaveText(
      firstRowText!,
    );
  });

  test("settings menu with auto-scroll toggle", async ({ page }) => {
    await openPanelWithTracks(page);

    const autoScrollItem = page.locator("[data-checked]");

    // Open settings menu
    await page.getByTitle("Settings").click();
    await expect(autoScrollItem).toHaveAttribute("data-checked", "true");

    // Close by pressing Escape
    await page.keyboard.press("Escape");
    await expect(page.getByText("Auto-scroll")).not.toBeVisible();

    // Reopen and toggle off (menu stays open)
    await page.getByTitle("Settings").click();
    await page.getByText("Auto-scroll").click();
    await expect(autoScrollItem).toHaveAttribute("data-checked", "false");

    // Reload and verify it persists as off
    await page.reload();
    // Tracks should be restored from per-video preference (saved above)
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await page.getByTitle("Settings").click();
    await expect(autoScrollItem).toHaveAttribute("data-checked", "false");
  });

  test("strategy dropdown switches merge strategy", async ({ page }) => {
    await openPanelWithTracks(page);

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
    await openPanelWithTracks(page);

    // Open settings menu and click export
    await page.getByTitle("Settings").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Export import.json").click(),
    ]);

    expect(download.suggestedFilename()).toBe("import-7GU_VQfgMT0.json");

    // Read and validate exported JSON
    const content = await (
      await download.createReadStream()
    )
      .toArray()
      .then((chunks) => Buffer.concat(chunks).toString());
    const data = JSON.parse(content);

    expect(data).toMatchObject({
      video: {
        youtubeId: "7GU_VQfgMT0",
        title: "Billlie | 'cloud palace' 𝐁efore sunrise live",
        channelName: "Billlie",
        channelId: "UCyc9sUCxELTDK9vELO5Fzeg",
        duration: 210,
        language1: "ko",
        language2: "en",
      },
      bookmarks: [],
    });
    expect(data.captions).toHaveLength(56);
    expect(data.captions[0]).toEqual({
      idx: 0,
      begin: 25.714,
      end: 29.621,
      text1: "꼬집어 봐 뜬 꿈인 것 같아",
      text2: "am I awake? or am I still dreaming",
    });
    expect(data.captions[55]).toEqual({
      idx: 55,
      begin: 197.448,
      end: 201.542,
      text1: "날 부른 이름 듣고 있으니까",
      text2: "I\u2019m hearing my name you left in the wind",
    });
  });

  test("panel left edge can be dragged to resize", async ({ page }) => {
    await openPanelWithTracks(page);

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
    await openPanelWithTracks(page);

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
