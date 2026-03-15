import { expect, test } from "@playwright/test";
import {
  createBookmarkAt,
  openPanelWithTracks,
  selectTextInCaption,
} from "./helper.ts";

test.describe("dev-viewer caption panel", () => {
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
    // Panel stays open (FAB state persisted), tracks restored from per-video preference
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

  test("manual bookmark: cancel selection, create, highlight, and export", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Select text — cancel hides FAB
    await selectTextInCaption(page, { index: 0, start: 0, end: 3 });
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).not.toBeVisible();

    // Select again and create bookmark
    await selectTextInCaption(page, { index: 0, start: 0, end: 3 });
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create bookmark" }).click();

    // FAB disappears, highlight appears
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).not.toBeVisible();
    const highlight = page.locator("[data-index='0'] .bg-highlight-bg").first();
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveText("꼬집어");

    // Export includes the bookmark
    await page.getByTitle("Settings").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Export import.json").click(),
    ]);
    const content = await (
      await download.createReadStream()
    )
      .toArray()
      .then((chunks) => Buffer.concat(chunks).toString());
    const data = JSON.parse(content);
    expect(data.bookmarks).toHaveLength(1);
    expect(data.bookmarks[0]).toMatchObject({
      text: "꼬집어",
      captionIdx: 0,
      side: 0,
      offset: 0,
      status: "manual",
    });
  });

  test("track picker locks when bookmarks exist", async ({ page }) => {
    await openPanelWithTracks(page);

    // Create a bookmark first
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Track selects should be disabled
    const selects = page.locator("select");
    await expect(selects.nth(0)).toBeDisabled();
    await expect(selects.nth(1)).toBeDisabled();

    // Clear bookmarks via settings menu
    await page.getByTitle("Settings").click();
    page.on("dialog", (d) => d.accept());
    await page.getByText("Clear bookmarks").click();

    // Track selects should be re-enabled
    await expect(selects.nth(0)).toBeEnabled();
    await expect(selects.nth(1)).toBeEnabled();

    // Highlight should be gone
    await expect(
      page.locator("[data-index='0'] .bg-highlight-bg"),
    ).not.toBeVisible();
  });

  test("bookmarks persist across panel close/reopen", async ({ page }) => {
    await openPanelWithTracks(page);

    // Create a bookmark
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await expect(
      page.locator("[data-index='0'] .bg-highlight-bg"),
    ).toBeVisible();

    // Close and reopen panel
    await page.getByTitle("Hide captions").click();
    await page.getByTitle("Show captions").click();

    // Bookmark highlight should still be there (hydrated from IndexedDB)
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await expect(
      page.locator("[data-index='0'] .bg-highlight-bg"),
    ).toBeVisible();
    await expect(
      page.locator("[data-index='0'] .bg-highlight-bg").first(),
    ).toHaveText("꼬집어");
  });

  test("bookmarks tab: empty state, create bookmark, count and context", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");

    // Tab bar visible
    await expect(panel.getByRole("button", { name: "Captions" })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Bookmarks/ }),
    ).toBeVisible();

    // Empty state
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("No bookmarks yet")).toBeVisible();

    // Create bookmark and verify count
    await panel.getByRole("button", { name: "Captions" }).click();
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await expect(
      panel.getByRole("button", { name: "Bookmarks (1)" }),
    ).toBeVisible();

    // Bookmark card with caption context
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    const bookmarkCard = page.locator("[data-bookmark-id]").first();
    await expect(bookmarkCard).toBeVisible();
    await expect(bookmarkCard.getByText("꼬집어").first()).toBeVisible();
    await expect(
      bookmarkCard.getByText("꼬집어 봐 뜬 꿈인 것 같아"),
    ).toBeVisible();
  });

  test("prev/next bookmark buttons appear when bookmarks exist", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // No nav buttons without bookmarks
    await expect(
      page.getByRole("button", { name: "Previous bookmark" }),
    ).not.toBeVisible();

    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    await expect(
      page.getByRole("button", { name: "Previous bookmark" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next bookmark" }),
    ).toBeVisible();
  });

  test("go-to-caption button switches from bookmarks to captions tab", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Switch to bookmarks tab
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]").first()).toBeVisible();

    // Click go-to-caption
    await page.getByRole("button", { name: "Go to caption" }).first().click();

    // Should switch back to captions tab
    await expect(panel.getByRole("button", { name: "Captions" })).toHaveClass(
      /font-medium/,
    );
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("delete bookmark from bookmarks tab", async ({ page }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]").first()).toBeVisible();

    // Open dropdown and delete
    page.on("dialog", (d) => d.accept());
    const bookmarkCard = page.locator("[data-bookmark-id]").first();
    await bookmarkCard
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // Should show empty state
    await expect(page.getByText("No bookmarks yet")).toBeVisible();

    // Highlight should be gone from captions
    await panel.getByRole("button", { name: "Captions" }).click();
    await expect(
      page.locator("[data-index='0'] .bg-highlight-bg"),
    ).not.toBeVisible();
  });

  test("bookmark highlight shows popover on click", async ({ page }) => {
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Click the bookmark highlight to open popover
    const highlight = page
      .locator("[data-index='0']")
      .getByTestId("bookmark-highlight")
      .first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    // Popover should show bookmark text
    const popover = page.getByTestId("bookmark-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByText("꼬집어")).toBeVisible();

    // "Go to bookmark" button should be present
    await expect(
      popover.getByRole("button", { name: "Go to bookmark" }),
    ).toBeVisible();
  });

  test("popover go-to-bookmark switches to bookmarks tab with flash-highlight", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Click highlight to open popover
    const highlight = page
      .locator("[data-index='0']")
      .getByTestId("bookmark-highlight")
      .first();
    await highlight.click();

    // Click "Go to bookmark" in popover
    const popover = page.getByTestId("bookmark-popover");
    await popover
      .getByRole("button", { name: "Go to bookmark" })
      .dispatchEvent("mousedown");

    // Should switch to bookmarks tab
    await expect(panel.getByRole("button", { name: /Bookmarks/ })).toHaveClass(
      /font-medium/,
    );

    // Bookmark card should be visible with flash-highlight animation
    const bookmarkCard = page.locator("[data-bookmark-id]").first();
    await expect(bookmarkCard).toBeVisible();
    await expect(bookmarkCard).toHaveClass(/flash-highlight/);
  });

  test("AI pick prompt: copy and import with markdown fence", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPanelWithTracks(page);
    await page.getByTitle("Settings").click();

    // Copy pick prompt
    await expect(page.getByText("AI prompt")).toBeVisible();
    await page.getByTitle("Copy prompt").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Pick Korean vocabulary");
    expect(clipboard).toContain("cloud palace");
    expect(clipboard).toContain("꼬집어 봐 뜬 꿈인 것 같아");
    expect(clipboard).toContain("captionIndex");
    expect(clipboard).toContain("```json");

    // Import result wrapped in markdown code fence
    const wrapped = `\`\`\`json
[{"captionIndex": 0, "text": "꼬집어", "translation": "to pinch", "etymology": "" },
 {"captionIndex": 1, "text": "밤새", "translation": "all night", "etymology": "" }]
\`\`\``;
    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") dialog.accept(wrapped);
      else dialog.accept();
    });
    await page.getByText("Import AI result").click();

    // Verify bookmarks created
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.locator("[data-bookmark-id]")).toHaveCount(2);
    await expect(
      page.locator("[data-bookmark-id]").first().getByText("to pinch"),
    ).toBeVisible();
  });

  test("AI fill prompt: copy and import updates existing bookmark", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPanelWithTracks(page);

    // Create a bookmark first
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Verify unfilled state
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("unfilled")).toBeVisible();
    const bookmarkId = await page
      .locator("[data-bookmark-id]")
      .first()
      .getAttribute("data-bookmark-id");

    // Copy fill prompt
    await page.getByTitle("Settings").click();
    const aiSelect = page.locator("select").last();
    await aiSelect.selectOption("fill");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Fill bookmark metadata");
    expect(clipboard).toContain("꼬집어");

    // Import fill result
    const json = JSON.stringify([
      {
        id: bookmarkId,
        translation: "to pinch",
        etymology: "",
        notes: "Figurative use.",
      },
    ]);
    page.on("dialog", (dialog) => {
      if (dialog.type() === "prompt") dialog.accept(json);
      else dialog.accept();
    });
    await page.getByText("Import AI result").click();

    // Verify translation appears and unfilled badge is gone
    await expect(page.getByText("to pinch")).toBeVisible();
    await expect(page.getByText("unfilled")).not.toBeVisible();
  });
});
