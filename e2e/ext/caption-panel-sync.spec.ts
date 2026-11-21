import { expect, type Page } from "@playwright/test";
import { createCheckpoint, setupDb } from "../helper";
import {
  gotoBookmarks,
  login,
  openPanelWithTracks,
  openYouTubeTab,
  seedChromeStorage,
  test,
} from "./helper";

// Billlie - cloud palace (seeded on server for "dev" user)
const SEED_VIDEO_ID = "7GU_VQfgMT0";

function openSyncMenu(ytPage: Page) {
  const host = ytPage.locator("#zamak-host");
  return test.step(
    "Open sync menu",
    async () => {
      await host.getByTitle("Settings").click();
      return host.getByTestId("sync-status");
    },
    { box: true },
  );
}

async function createFirstBookmark(ytPage: Page) {
  await test.step(
    "Create bookmark",
    async () => {
      const host = ytPage.locator("#zamak-host");
      await host
        .locator("[data-index='0'] [data-side='0'] [data-offset]")
        .selectText();
      await host.getByRole("button", { name: "Create bookmark" }).click();
      await expect(
        host.getByRole("button", { name: "Bookmarks (1)" }),
      ).toBeVisible();
    },
    { box: true },
  );
}

test("caption panel: push from the sync menu, then open the bookmarks page", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  await createFirstBookmark(ytPage);

  const status = await openSyncMenu(ytPage);
  await expect(status).toHaveAttribute("data-sync-state", "push");
  const checkpoint = createCheckpoint();
  await status.click();
  // The menu stays open through the push
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("push synced");

  const bookmarksPagePromise = context.waitForEvent("page");
  await ytPage
    .locator("#zamak-host")
    .getByRole("menuitem", { name: "Open bookmarks page" })
    .click();
  const bookmarksPage = await bookmarksPagePromise;
  await expect(
    bookmarksPage
      .getByTestId(`video-card-${SEED_VIDEO_ID}`)
      .getByTestId("video-sync-badge"),
  ).toHaveAttribute("data-sync-status", "synced");
});

test("caption panel: pull from the sync menu replaces captions and bookmarks in place", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  await expect(
    host.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toBeVisible();

  const status = await openSyncMenu(ytPage);
  await expect(status).toHaveAttribute("data-sync-state", "pull");
  const checkpoint = createCheckpoint();
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("pull synced");

  await ytPage.keyboard.press("Escape");
  await expect(
    host.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();
});

test("caption panel: a failed push shows its error in the sync menu", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  await createFirstBookmark(ytPage);

  const status = await openSyncMenu(ytPage);
  await expect(status).toHaveAttribute("data-sync-state", "push");

  // The background reads the server URL on each call, so the push can't reach the server
  await seedChromeStorage(context, { serverUrl: "http://127.0.0.1:9" });
  await status.click();
  await expect(
    ytPage.locator("#zamak-host").getByTestId("sync-error"),
  ).toContainText("Upload failed");
  await expect(status).toHaveAttribute("data-sync-state", "push");
});

test("caption panel: a pull from the bookmarks page updates the open panel", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");

  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  await login(page);
  const badge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");

  // The open panel picks up the pulled session and the sync record without a reload
  await ytPage.bringToFront();
  await expect(
    host.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();
  const status = await openSyncMenu(ytPage);
  await expect(status).toHaveAttribute("data-sync-state", "synced");

  // A fresh load reads the current index on its first load
  await ytPage.reload();
  await expect(
    host.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();
  await expect(await openSyncMenu(ytPage)).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
});

test("caption panel: a new YouTube tab reads the current index on its first load", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // An index entry that never synced shows as a conflict against the server's copy.
  // Without it, the panel would show a pull.
  await seedChromeStorage(context, {
    "zamak:video-index": [
      {
        youtubeId: SEED_VIDEO_ID,
        title: "seed",
        channelName: "seed",
        bookmarkCount: 1,
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ],
  });
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  await expect(await openSyncMenu(ytPage)).toHaveAttribute(
    "data-sync-state",
    "conflict",
  );
});
