import { expect, test } from "@playwright/test";
import { openPanelWithTracks } from "./helper.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/videos/7GU_VQfgMT0");
});

test("FAB toggles panel, rows render with timestamps", async ({ page }) => {
  // Panel starts closed — no caption rows visible
  await expect(page.locator("[data-index='0']")).not.toBeVisible();

  // Open panel and select tracks
  await openPanelWithTracks(page);

  // Multiple rows rendered (fixture has many cues)
  await expect(page.locator("[data-index='5']")).toBeVisible();

  // Rows show timestamp and dual-column text
  const row = page.locator("[data-index='0']");
  await expect(row.locator("text=/\\d+:\\d{2} – \\d+:\\d{2}/")).toBeVisible();
  const cols = row.locator(".flex-1");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0)).not.toHaveText("");
  await expect(cols.nth(1)).not.toHaveText("");

  // Close panel via FAB
  await page.getByTitle("Hide captions").click();
  await expect(page.locator("[data-index='0']")).not.toBeVisible();
});

test("FAB open state persists across reload", async ({ page }) => {
  // Open panel
  await page.getByTitle("Show captions").click();

  // Reload — panel should reopen automatically
  await page.reload();
  await expect(page.getByTitle("Hide captions")).toBeVisible();

  // Close panel
  await page.getByTitle("Hide captions").click();

  // Reload — panel should stay closed
  await page.reload();
  await expect(page.getByTitle("Show captions")).toBeVisible();
});

test("FAB state is independent per video", async ({ page }) => {
  // Open panel on first video
  await page.getByTitle("Show captions").click();
  await expect(page.getByTitle("Hide captions")).toBeVisible();

  // Navigate to a different video — should default to closed
  await page.goto("/dev/videos/DtK-CkwNHSY");
  await expect(page.getByTitle("Show captions")).toBeVisible();

  // Go back to first video — should still be open
  await page.goto("/dev/videos/7GU_VQfgMT0");
  await expect(page.getByTitle("Hide captions")).toBeVisible();
});

test("track selection: default empty, select tracks, switch language", async ({
  page,
}) => {
  await page.getByTitle("Show captions").click();

  // Track pickers default to "None"
  const selects = page.locator("select");
  await expect(selects.nth(0)).toHaveValue("");
  await expect(selects.nth(1)).toHaveValue("");
  await expect(page.locator("[data-index='0']")).not.toBeVisible();

  // Select tracks — captions appear
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();

  // Switch lang2 from en to ja — text changes
  const firstRowText = await page.locator("[data-index='0']").textContent();
  await selects.nth(1).selectOption(".ja");
  await expect(page.locator("[data-index='0']")).not.toHaveText(firstRowText!);
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
  // Panel stays open (FAB state persisted), tracks restored from per-video preference
  await expect(page.locator("[data-index='0']")).toBeVisible();
  await page.getByTitle("Settings").click();
  await expect(autoScrollItem).toHaveAttribute("data-checked", "false");
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
