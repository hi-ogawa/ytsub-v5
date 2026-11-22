import { expect } from "@playwright/test";
import { createCheckpoint, SEED_VIDEO_ID, setupDb } from "../helper";
import {
  createBookmarkAt,
  gotoBookmarks,
  login,
  openPanelWithTracks,
  openSyncMenu,
  seedChromeStorage,
  test,
} from "./helper";

test("push from the sync menu, then open the bookmarks page", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);

  // A video without bookmarks isn't in the video index yet
  let status = await openSyncMenu(host);
  await expect(status).toHaveAttribute("data-sync-state", "empty");
  await ytPage.keyboard.press("Escape");

  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  status = await openSyncMenu(host);
  await expect(status).toHaveAttribute("data-sync-state", "push");
  const checkpoint = createCheckpoint();
  await status.click();
  // The menu stays open through the push
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("push synced");

  const bookmarksPagePromise = context.waitForEvent("page");
  await host.getByRole("menuitem", { name: "Open bookmarks page" }).click();
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

  const { ytPage, host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  await expect(
    host.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toBeVisible();

  const status = await openSyncMenu(host);
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

test("shows conflict when local bookmarks and server data both exist", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const { host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  const status = await openSyncMenu(host);
  await expect(status).toHaveAttribute("data-sync-state", "conflict");
});

test("a failed push shows its error in the sync menu", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_VIDEO_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  const status = await openSyncMenu(host);
  await expect(status).toHaveAttribute("data-sync-state", "push");

  // The background reads the server URL on each call, so the push can't reach the server
  await seedChromeStorage(context, { serverUrl: "http://127.0.0.1:9" });
  await status.click();
  await expect(host.getByTestId("sync-error")).toContainText("Upload failed");
  await expect(status).toHaveAttribute("data-sync-state", "push");
});
