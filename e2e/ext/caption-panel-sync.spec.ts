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

test("push from the sync menu, then open the bookmarks page", async ({
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

test("pull from the sync menu replaces captions and bookmarks in place", async ({
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

test("a failed push shows its error in the sync menu", async ({
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
