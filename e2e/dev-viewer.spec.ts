import { expect, type Page, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

/** Open panel and select ko/en tracks so caption rows appear */
async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

/** Select text in a caption row and create a bookmark */
async function createBookmarkAt(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await page.evaluate(
    ({ index, start, end }) => {
      const sideEl = document
        .querySelector(`[data-index='${index}']`)!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { index, start, end },
  );
  await page.getByRole("button", { name: "Create bookmark" }).click();
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
    await page.goto("/dev/youtube/DtK-CkwNHSY");
    await expect(page.getByTitle("Show captions")).toBeVisible();

    // Go back to first video — should still be open
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await expect(page.getByTitle("Hide captions")).toBeVisible();
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

  test("manual bookmark: create, highlight, and export", async ({ page }) => {
    await openPanelWithTracks(page);

    // Select "꼬집어" in first row (chars 0-3 in "꼬집어 봐 뜬 꿈인 것 같아")
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='0']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });

    // FAB appears → create bookmark
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
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='0']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.getByRole("button", { name: "Create bookmark" }).click();

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
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='0']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.getByRole("button", { name: "Create bookmark" }).click();
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

  test("cancel text selection hides FAB", async ({ page }) => {
    await openPanelWithTracks(page);

    // Select text
    await page.evaluate(() => {
      const sideEl = document
        .querySelector("[data-index='0']")!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("button", { name: "Create bookmark" }),
    ).not.toBeVisible();
  });

  test("tab bar shows captions and bookmarks tabs", async ({ page }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await expect(panel.getByRole("button", { name: "Captions" })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /Bookmarks/ }),
    ).toBeVisible();
  });

  test("bookmarks tab shows empty state", async ({ page }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("No bookmarks yet")).toBeVisible();
  });

  test("bookmarks tab shows created bookmark with caption context", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    // Create bookmark "꼬집어" at idx=0
    await createBookmarkAt(page, 0, 0, 3);

    // Switch to bookmarks tab
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    // Bookmark card should be visible
    const bookmarkCard = page.locator("[data-bookmark-id]").first();
    await expect(bookmarkCard).toBeVisible();
    await expect(bookmarkCard.getByText("꼬집어").first()).toBeVisible();
    // Caption context shown
    await expect(
      bookmarkCard.getByText("꼬집어 봐 뜬 꿈인 것 같아"),
    ).toBeVisible();
  });

  test("bookmark count shown in tab label", async ({ page }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await createBookmarkAt(page, 0, 0, 3);
    await expect(
      panel.getByRole("button", { name: "Bookmarks (1)" }),
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

    await createBookmarkAt(page, 0, 0, 3);

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
    await createBookmarkAt(page, 0, 0, 3);

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
    await createBookmarkAt(page, 0, 0, 3);

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

  test("captions tab preserves scroll after switching tabs", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    const panel = page.getByTestId("resizable-panel");
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Switch to bookmarks and back
    await panel.getByRole("button", { name: /Bookmarks/ }).click();
    await expect(page.getByText("No bookmarks yet")).toBeVisible();
    await panel.getByRole("button", { name: "Captions" }).click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
  });

  test("bookmark highlight shows popover on click", async ({ page }) => {
    await openPanelWithTracks(page);
    await createBookmarkAt(page, 0, 0, 3);

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
    await createBookmarkAt(page, 0, 0, 3);

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

  test("creating bookmark populates dev-bookmarks page via video-index", async ({
    page,
  }) => {
    await openPanelWithTracks(page);
    await createBookmarkAt(page, 0, 0, 2);

    // Navigate to bookmarks page and verify the video card
    await page.goto("/dev/bookmarks");
    const card = page.getByTestId("video-card-7GU_VQfgMT0");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("video-card-title")).toHaveText(
      /cloud palace/,
    );
    await expect(card.getByTestId("video-card-channel")).toHaveText("Billlie");
    await expect(card.getByTestId("video-card-badge")).toHaveText("1 bookmark");

    // Create another bookmark, verify count updates on revisit
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    // Panel stays open (FAB state persisted from earlier in this test)
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await createBookmarkAt(page, 1, 0, 2);
    await page.goto("/dev/bookmarks");
    await expect(
      page
        .getByTestId("video-card-7GU_VQfgMT0")
        .getByTestId("video-card-badge"),
    ).toHaveText("2 bookmarks");
  });
});

test.describe("dev-viewer sync", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb();
    await login(page);
    // Clear IndexedDB and localStorage from previous tests
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await page.evaluate(() => {
      localStorage.removeItem("zamak:video-index");
      const req = indexedDB.deleteDatabase("zamak");
      return new Promise<void>((resolve) => {
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    });
    await page.goto("/dev/youtube/7GU_VQfgMT0");
  });

  test("sync button shows push state after creating bookmark, synced after push", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Sync button should be visible
    const syncBtn = page.getByTestId("sync-button");
    await expect(syncBtn).toBeVisible();

    // Initially synced (no local data, no server data)
    await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");

    // Create a bookmark
    await createBookmarkAt(page, 0, 0, 3);

    // Should switch to push state
    await expect(syncBtn).toHaveAttribute("data-sync-state", "push");

    // Click sync (push)
    await syncBtn.click();

    // Should transition to synced
    await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");
  });

  test("pushed data appears in server video list", async ({ page }) => {
    await openPanelWithTracks(page);

    // Create bookmark and push
    await createBookmarkAt(page, 0, 0, 3);
    const syncBtn = page.getByTestId("sync-button");
    await expect(syncBtn).toHaveAttribute("data-sync-state", "push");
    await syncBtn.click();
    await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");

    // Navigate to video list — the synced video should appear
    await page.goto("/");
    await expect(page.getByText("cloud palace")).toBeVisible();
  });

  test("pull overwrites local session with server data", async ({ page }) => {
    await openPanelWithTracks(page);

    // Create 2 bookmarks locally and push
    await createBookmarkAt(page, 0, 0, 3);
    await createBookmarkAt(page, 1, 0, 2);
    const syncBtn = page.getByTestId("sync-button");
    await syncBtn.click();
    await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");

    // Verify 2 bookmarks
    const panel = page.getByTestId("resizable-panel");
    await expect(
      panel.getByRole("button", { name: "Bookmarks (2)" }),
    ).toBeVisible();

    // Now clear local bookmarks and clear IndexedDB to simulate fresh device
    await page.evaluate((videoId) => {
      // Clear IndexedDB session
      const req = indexedDB.open("zamak");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("caption-sessions", "readwrite");
        tx.objectStore("caption-sessions").delete(videoId);
      };
      // Clear video-index syncedAt to force pull state
      const idx = JSON.parse(localStorage.getItem("zamak:video-index") ?? "[]");
      const filtered = idx.filter(
        (e: { youtubeId: string }) => e.youtubeId !== videoId,
      );
      localStorage.setItem("zamak:video-index", JSON.stringify(filtered));
    }, "7GU_VQfgMT0");

    // Reload to pick up cleared state
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await openPanelWithTracks(page);

    // Should show pull state (server has data, local doesn't)
    const syncBtn2 = page.getByTestId("sync-button");
    await expect(syncBtn2).toHaveAttribute("data-sync-state", "pull");

    // Pull
    await syncBtn2.click();
    await expect(syncBtn2).toHaveAttribute("data-sync-state", "synced");

    // After pull + page reload, bookmarks should be restored from IndexedDB
    await page.goto("/dev/youtube/7GU_VQfgMT0");
    await page.getByTitle("Show captions").click();
    // Session should hydrate from IndexedDB with pulled data
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const panel2 = page.getByTestId("resizable-panel");
    await expect(
      panel2.getByRole("button", { name: "Bookmarks (2)" }),
    ).toBeVisible();
  });
});
