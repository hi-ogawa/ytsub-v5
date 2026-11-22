import { expect } from "@playwright/test";
import { SEED_YOUTUBE_ID } from "../helper";
import {
  createBookmarkAt,
  openPanelWithTracks,
  selectTextInCaption,
  test,
} from "./helper";

test("clicks inside the bookmark popover don't reach the caption row", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await host
    .locator("[data-index='1'] [data-side='0'] [data-offset]")
    .selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  const video = ytPage.locator("video");
  const isPaused = () => video.evaluate((el: HTMLVideoElement) => el.paused);

  const highlight = host
    .locator("[data-index='1']")
    .getByTestId("bookmark-highlight");
  await highlight.click();
  const popover = host.getByTestId("bookmark-popover");
  await expect(
    popover.getByRole("button", { name: "Go to bookmark" }),
  ).toBeVisible();
  await popover.getByText("unfilled").click();
  await expect(popover).toBeVisible();
  expect(await isPaused()).toBe(true);

  // A second click on the highlight closes the popover
  await highlight.click();
  await expect(popover).not.toBeVisible();
  expect(await isPaused()).toBe(true);

  // A click on the row itself seeks and plays
  await host.locator("[data-index='2']").click();
  await expect.poll(isPaused).toBe(false);
});

test("bookmark arrows keep the play state", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const prevButton = host.getByRole("button", { name: "Previous bookmark" });
  const nextButton = host.getByRole("button", { name: "Next bookmark" });
  await expect(prevButton).toBeDisabled();
  await expect(nextButton).toBeDisabled();
  await host
    .locator("[data-index='1'] [data-side='0'] [data-offset]")
    .selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  await expect(prevButton).toBeEnabled();
  await expect(nextButton).toBeEnabled();
  const video = ytPage.locator("video");
  const isPaused = () => video.evaluate((el: HTMLVideoElement) => el.paused);
  const getCurrentTime = () =>
    video.evaluate((el: HTMLVideoElement) => el.currentTime);

  // A paused video stays paused at the bookmark
  expect(await isPaused()).toBe(true);
  await host.getByRole("button", { name: "Next bookmark" }).click();
  await expect.poll(getCurrentTime).toBeGreaterThan(0);
  expect(await isPaused()).toBe(true);

  // A playing video keeps playing
  await host.locator("[data-index='2']").click();
  await expect.poll(isPaused).toBe(false);
  await host.getByRole("button", { name: "Previous bookmark" }).click();
  expect(await isPaused()).toBe(false);
});

test("bookmark arrows wrap around at the ends", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 1, start: 0, end: 3 });
  await createBookmarkAt(host, { index: 3, start: 0, end: 3 });
  const video = ytPage.locator("video");
  const getCurrentTime = () =>
    video.evaluate((el: HTMLVideoElement) => el.currentTime);
  async function clickAndGetTime(name: string) {
    return await test.step(
      `Click ${name}`,
      async () => {
        const before = await getCurrentTime();
        await host.getByRole("button", { name }).click();
        await expect.poll(getCurrentTime).not.toBe(before);
        return getCurrentTime();
      },
      { box: true },
    );
  }

  const first = await clickAndGetTime("Next bookmark");
  const second = await clickAndGetTime("Next bookmark");
  expect(second).toBeGreaterThan(first);
  expect(await clickAndGetTime("Next bookmark")).toBe(first);
  expect(await clickAndGetTime("Previous bookmark")).toBe(second);
});

test("bookmark arrows show the caption while paused", async ({ context }) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const row = host.locator("[data-index='30']");
  await row.locator("[data-side='0'] [data-offset]").selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  await host.locator("[data-index='0']").scrollIntoViewIfNeeded();
  await expect(row).not.toBeInViewport();

  await host.getByRole("button", { name: "Next bookmark" }).click();
  const getOffsetFromCenter = () =>
    row.evaluate((el) => {
      const list = el
        .closest("[data-testid='caption-list']")!
        .getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return Math.abs(
        rect.top + rect.height / 2 - (list.top + list.height / 2),
      );
    });
  await expect.poll(getOffsetFromCenter).toBeLessThan(2);
  await expect(row).toHaveAttribute("aria-current", "true");
});

test("bookmarks tab marks every card from the current row", async ({
  context,
}) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  // The later selection goes first, because a bookmark splits the row's text
  await createBookmarkAt(host, { index: 2, start: 4, end: 6 });
  await createBookmarkAt(host, { index: 2, start: 0, end: 2 });
  await createBookmarkAt(host, { index: 3, start: 0, end: 2 });
  await host.getByRole("tab", { name: /Bookmarks/ }).click();
  const cards = host.locator("[data-bookmark-id]");
  const currentCards = host.locator("[data-bookmark-id][aria-current='true']");

  await cards.nth(2).click();
  await expect(currentCards).toHaveCount(1);
  await expect(cards.nth(2)).toHaveAttribute("aria-current", "true");

  await host.getByRole("button", { name: "Previous bookmark" }).click();
  await expect(currentCards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "true");
});

test("manual bookmark: cancel selection, create, highlight, and export", async ({
  context,
}) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // Select text — cancel hides FAB
  await selectTextInCaption(host, { index: 0, start: 0, end: 3 });
  await expect(host.getByRole("button", { name: "Cancel" })).toBeVisible();
  await host.getByRole("button", { name: "Cancel" }).click();
  await expect(
    host.getByRole("button", { name: "Create bookmark" }),
  ).not.toBeVisible();

  // Select again and create bookmark
  await selectTextInCaption(host, { index: 0, start: 0, end: 3 });
  await expect(
    host.getByRole("button", { name: "Create bookmark" }),
  ).toBeVisible();
  await host.getByRole("button", { name: "Create bookmark" }).click();

  // FAB disappears, highlight appears
  await expect(
    host.getByRole("button", { name: "Create bookmark" }),
  ).not.toBeVisible();
  const highlight = host.locator("[data-index='0'] .bg-highlight-bg").first();
  await expect(highlight).toBeVisible();
  await expect(highlight).toHaveText("꼬집어");

  // Export includes the bookmark
  await host.getByTitle("Settings").click();
  const [download] = await Promise.all([
    ytPage.waitForEvent("download"),
    host.getByText("Export import.json").click(),
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

test("track picker locks when bookmarks exist", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // Create a bookmark first
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  // Track selects should be disabled
  const selects = host.locator("select");
  await expect(selects.nth(0)).toBeDisabled();
  await expect(selects.nth(1)).toBeDisabled();

  // Clear bookmarks via settings menu
  await host.getByTitle("Settings").click();
  ytPage.on("dialog", (d) => d.accept());
  await host.getByText("Clear bookmarks").click();

  // Track selects should be re-enabled
  await expect(selects.nth(0)).toBeEnabled();
  await expect(selects.nth(1)).toBeEnabled();

  // Highlight should be gone
  await expect(
    host.locator("[data-index='0'] .bg-highlight-bg"),
  ).not.toBeVisible();
});

test("bookmarks persist across panel close/reopen", async ({ context }) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // Create a bookmark
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await expect(host.locator("[data-index='0'] .bg-highlight-bg")).toBeVisible();

  // Close and reopen panel
  await host.getByTitle("Hide captions").click();
  await host.getByTitle("Show captions").click();

  // Bookmark highlight should still be there (hydrated from IndexedDB)
  await expect(host.locator("[data-index='0']")).toBeVisible();
  await expect(host.locator("[data-index='0'] .bg-highlight-bg")).toBeVisible();
  await expect(
    host.locator("[data-index='0'] .bg-highlight-bg").first(),
  ).toHaveText("꼬집어");
});

test("bookmarks tab: empty state, create bookmark, count and context", async ({
  context,
}) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");

  // Tab bar visible
  await expect(panel.getByRole("tab", { name: "Captions" })).toBeVisible();
  await expect(panel.getByRole("tab", { name: /Bookmarks/ })).toBeVisible();

  // Empty state
  await panel.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(host.getByText("No bookmarks yet")).toBeVisible();

  // Create bookmark and verify count
  await panel.getByRole("tab", { name: "Captions" }).click();
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await expect(panel.getByRole("tab", { name: "Bookmarks (1)" })).toBeVisible();

  // Bookmark card with caption context
  await panel.getByRole("tab", { name: /Bookmarks/ }).click();
  const bookmarkCard = host.locator("[data-bookmark-id]").first();
  await expect(bookmarkCard).toBeVisible();
  await expect(bookmarkCard.getByText("꼬집어").first()).toBeVisible();
  await expect(
    bookmarkCard.getByText("꼬집어 봐 뜬 꿈인 것 같아"),
  ).toBeVisible();
});

test("bookmarks tab orders bookmarks in one row by offset", async ({
  context,
}) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");

  // Create the later word first
  await createBookmarkAt(host, { index: 0, start: 8, end: 10 });
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  await panel.getByRole("tab", { name: "Bookmarks (2)" }).click();
  const cards = host.locator("[data-bookmark-id] .font-medium");
  await expect(cards).toHaveText(["꼬집어", "꿈인"]);
});

test("go-to-caption button switches from bookmarks to captions tab", async ({
  context,
}) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  // Switch to bookmarks tab
  await panel.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(host.locator("[data-bookmark-id]").first()).toBeVisible();

  // Click go-to-caption
  await host.getByRole("button", { name: "Go to caption" }).first().click();

  // Should switch back to captions tab
  await expect(panel.getByRole("tab", { name: "Captions" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(host.locator("[data-index='0']")).toBeVisible();
});

test("delete bookmark from bookmarks tab", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  await panel.getByRole("tab", { name: /Bookmarks/ }).click();
  await expect(host.locator("[data-bookmark-id]").first()).toBeVisible();

  // Open dropdown and delete
  ytPage.on("dialog", (d) => d.accept());
  const bookmarkCard = host.locator("[data-bookmark-id]").first();
  await bookmarkCard
    .getByRole("button")
    .filter({ has: ytPage.locator("svg") })
    .first()
    .click();
  await host.getByRole("menuitem", { name: "Delete" }).click();

  // Should show empty state
  await expect(host.getByText("No bookmarks yet")).toBeVisible();

  // Highlight should be gone from captions
  await panel.getByRole("tab", { name: "Captions" }).click();
  await expect(
    host.locator("[data-index='0'] .bg-highlight-bg"),
  ).not.toBeVisible();
});

test("bookmark numbers in popover and bookmarks tab", async ({ context }) => {
  const { ytPage, host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");
  // Create out of order, so numbers must follow timestamps
  await createBookmarkAt(host, { index: 4, start: 0, end: 2 });
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await createBookmarkAt(host, { index: 2, start: 0, end: 1 });

  // Popover shows the bookmark's number
  await host
    .locator("[data-index='2']")
    .getByTestId("bookmark-highlight")
    .first()
    .click();
  await expect(host.getByTestId("bookmark-popover")).toContainText("#2널");
  await ytPage.keyboard.press("Escape");

  // Bookmark cards are numbered in order
  await panel.getByRole("tab", { name: /Bookmarks/ }).click();
  const cards = host.locator("[data-bookmark-id]");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("#1꼬집어");
  await expect(cards.nth(1)).toContainText("#2널");
  await expect(cards.nth(2)).toContainText("#3아직");

  // Deleting the first bookmark renumbers the rest
  ytPage.on("dialog", (d) => d.accept());
  await cards
    .nth(0)
    .getByRole("button")
    .filter({ has: ytPage.locator("svg") })
    .first()
    .click();
  await host.getByRole("menuitem", { name: "Delete" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("#1널");
  await expect(cards.nth(1)).toContainText("#2아직");
});

test("popover go-to-bookmark switches to bookmarks tab and flashes the card", async ({
  context,
}) => {
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  const panel = host.getByTestId("resizable-panel");
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await createBookmarkAt(host, { index: 2, start: 0, end: 1 });
  const cards = host.locator("[data-bookmark-id]");

  async function goToBookmark(index: number) {
    await test.step(
      `Go to bookmark at caption ${index}`,
      async () => {
        await host
          .locator(`[data-index='${index}']`)
          .getByTestId("bookmark-highlight")
          .first()
          .click();
        await host
          .getByTestId("bookmark-popover")
          .getByRole("button", { name: "Go to bookmark" })
          .dispatchEvent("mousedown");
      },
      { box: true },
    );
  }

  await goToBookmark(0);

  // Should switch to bookmarks tab and close the popover
  await expect(panel.getByRole("tab", { name: /Bookmarks/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(host.getByTestId("bookmark-popover")).toHaveCount(0);

  // Bookmark card should be visible and flashing
  await expect(cards.nth(0)).toBeVisible();
  await expect(cards.nth(0)).toHaveAttribute("data-flash");

  // Hiding the tab mid-flash must not leave the flash to replay later
  await panel.getByRole("tab", { name: /Captions/ }).click();
  await goToBookmark(2);
  await expect(cards.nth(1)).toHaveAttribute("data-flash");
  await expect(cards.nth(0)).not.toHaveAttribute("data-flash");
});
