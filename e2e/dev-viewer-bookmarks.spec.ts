import { expect, test } from "@playwright/test";
import {
  createBookmarkAt,
  openPanelWithTracks,
  selectTextInCaption,
} from "./helper.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/videos/7GU_VQfgMT0");
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
  await expect(page.locator("[data-index='0'] .bg-highlight-bg")).toBeVisible();

  // Close and reopen panel
  await page.getByTitle("Hide captions").click();
  await page.getByTitle("Show captions").click();

  // Bookmark highlight should still be there (hydrated from IndexedDB)
  await expect(page.locator("[data-index='0']")).toBeVisible();
  await expect(page.locator("[data-index='0'] .bg-highlight-bg")).toBeVisible();
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
  await expect(panel.getByRole("button", { name: /Bookmarks/ })).toBeVisible();

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

test("bookmarks tab orders bookmarks in one row by offset", async ({
  page,
}) => {
  await openPanelWithTracks(page);
  const panel = page.getByTestId("resizable-panel");

  // Create the later word first
  await createBookmarkAt(page, { index: 0, start: 8, end: 10 });
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

  await panel.getByRole("button", { name: "Bookmarks (2)" }).click();
  const cards = page.locator("[data-bookmark-id] .font-medium");
  await expect(cards).toHaveText(["꼬집어", "꿈인"]);
});

test("prev/next bookmark buttons appear when bookmarks exist", async ({
  page,
}) => {
  await openPanelWithTracks(page);

  // Nav buttons visible but disabled without bookmarks
  const prevBtn = page.getByRole("button", { name: "Previous bookmark" });
  const nextBtn = page.getByRole("button", { name: "Next bookmark" });
  await expect(prevBtn).toBeVisible();
  await expect(prevBtn).toBeDisabled();
  await expect(nextBtn).toBeVisible();
  await expect(nextBtn).toBeDisabled();

  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

  // Enabled after bookmark created
  await expect(prevBtn).toBeEnabled();
  await expect(nextBtn).toBeEnabled();
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

test("bookmark numbers in popover and bookmarks tab", async ({ page }) => {
  await openPanelWithTracks(page);
  const panel = page.getByTestId("resizable-panel");
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
  await createBookmarkAt(page, { index: 2, start: 0, end: 1 });
  await createBookmarkAt(page, { index: 4, start: 0, end: 2 });

  // Popover shows the bookmark's number
  await page
    .locator("[data-index='2']")
    .getByTestId("bookmark-highlight")
    .first()
    .click();
  await expect(page.getByTestId("bookmark-popover")).toContainText("#2널");
  await page.keyboard.press("Escape");

  // Bookmark cards are numbered in order
  await panel.getByRole("button", { name: /Bookmarks/ }).click();
  const cards = page.locator("[data-bookmark-id]");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("#1꼬집어");
  await expect(cards.nth(1)).toContainText("#2널");
  await expect(cards.nth(2)).toContainText("#3아직");

  // Deleting the first bookmark renumbers the rest
  page.on("dialog", (d) => d.accept());
  await cards
    .nth(0)
    .getByRole("button")
    .filter({ has: page.locator("svg") })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("#1널");
  await expect(cards.nth(1)).toContainText("#2아직");
});

test("bookmark numbers follow timestamps in both tabs", async ({ page }) => {
  await openPanelWithTracks(page);
  const panel = page.getByTestId("resizable-panel");

  // Create the later bookmark first
  await createBookmarkAt(page, { index: 2, start: 0, end: 1 });
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

  await page
    .locator("[data-index='0']")
    .getByTestId("bookmark-highlight")
    .first()
    .click();
  await expect(page.getByTestId("bookmark-popover")).toContainText("#1꼬집어");
  await page.keyboard.press("Escape");

  await panel.getByRole("button", { name: /Bookmarks/ }).click();
  const cards = page.locator("[data-bookmark-id]");
  await expect(cards.nth(0)).toContainText("#1꼬집어");
  await expect(cards.nth(1)).toContainText("#2널");
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

  // Click the highlight again to close the popover
  await highlight.click();
  await expect(popover).not.toBeVisible();
});

test("popover go-to-bookmark switches to bookmarks tab with flash-highlight", async ({
  page,
}) => {
  await openPanelWithTracks(page);
  const panel = page.getByTestId("resizable-panel");
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
  await createBookmarkAt(page, { index: 2, start: 0, end: 1 });
  const cards = page.locator("[data-bookmark-id]");

  async function goToBookmark(index: number) {
    await test.step(
      `Go to bookmark at caption ${index}`,
      async () => {
        await page
          .locator(`[data-index='${index}']`)
          .getByTestId("bookmark-highlight")
          .first()
          .click();
        await page
          .getByTestId("bookmark-popover")
          .getByRole("button", { name: "Go to bookmark" })
          .dispatchEvent("mousedown");
      },
      { box: true },
    );
  }

  await goToBookmark(0);

  // Should switch to bookmarks tab and close the popover
  await expect(panel.getByRole("button", { name: /Bookmarks/ })).toHaveClass(
    /font-medium/,
  );
  await expect(page.getByTestId("bookmark-popover")).toHaveCount(0);

  // Bookmark card should be visible with flash-highlight animation
  await expect(cards.nth(0)).toBeVisible();
  await expect(cards.nth(0)).toHaveClass(/flash-highlight/);

  // Hiding the tab mid-flash must not leave the class to replay later
  await panel.getByRole("button", { name: /Captions/ }).click();
  await goToBookmark(2);
  await expect(cards.nth(1)).toHaveClass(/flash-highlight/);
  await expect(cards.nth(0)).not.toHaveClass(/flash-highlight/);
});
