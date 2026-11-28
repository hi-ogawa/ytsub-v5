import { expect } from "@playwright/test";
import {
  clearServerBookmarks,
  createCheckpoint,
  editOnServer,
  SEED_YOUTUBE_ID,
  setupDb,
} from "../helper";
import {
  createBookmarkAt,
  gotoBookmarks,
  login,
  openPanelWithTracks,
  seedChromeStorage,
  test,
} from "./helper";

test("upload from the panel header, then open the bookmarks page", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  // A video without bookmarks isn't in the video index yet
  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "empty");

  // A local edit turns the status into upload without a server check
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await expect(status).toHaveAttribute("data-sync-state", "push");
  await status.hover();
  await expect(host.getByRole("tooltip")).toHaveText("Upload: click to upload");
  const checkpoint = createCheckpoint();
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("push synced");

  const bookmarksPagePromise = context.waitForEvent("page");
  await host.getByTitle("Settings").click();
  await host.getByRole("menuitem", { name: "Open bookmarks page" }).click();
  const bookmarksPage = await bookmarksPagePromise;
  await expect(
    bookmarksPage
      .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
      .getByTestId("video-sync-badge"),
  ).toHaveAttribute("data-sync-status", "synced");
});

test("upload a video without bookmarks from the panel header", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "empty");
  const checkpoint = createCheckpoint();
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("push synced");

  // Pushing added the video to the list
  await page.reload();
  await expect(
    page
      .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
      .getByTestId("video-sync-badge"),
  ).toHaveAttribute("data-sync-status", "synced");
});

test("download from the panel header replaces captions and bookmarks in place", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await expect(
    host.getByRole("tab", { name: "Bookmarks", exact: true }),
  ).toBeVisible();

  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "pull");
  const checkpoint = createCheckpoint();
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");
  checkpoint("pull synced");

  await expect(host.getByRole("tab", { name: "Bookmarks (15)" })).toBeVisible();
});

test("a bookmark added after pulling a video without bookmarks is ready to push", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await clearServerBookmarks(SEED_YOUTUBE_ID);
  await gotoBookmarks(page, extensionId);
  await login(page);

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "pull");
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");

  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await expect(status).toHaveAttribute("data-sync-state", "push");
});

test("shows conflict when local bookmarks and server data both exist", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "conflict");
});

test("a failed push shows its error under the panel header", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });

  const status = host.getByTestId("sync-status");
  await expect(status).toHaveAttribute("data-sync-state", "push");

  // The background reads the server URL on each call, so the push can't reach the server
  await seedChromeStorage(context, { serverUrl: "http://127.0.0.1:9" });
  await status.click();
  await expect(host.getByTestId("sync-error")).toContainText("Upload failed");
  await expect(status).toHaveAttribute("data-sync-state", "push");
});

test("an upload clicked from a stale status stops at conflict", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  const status = host.getByTestId("sync-status");
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "synced");

  // Another device pushes while this panel's last check is still fresh
  await editOnServer(SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 1, start: 0, end: 3 });
  await expect(status).toHaveAttribute("data-sync-state", "push");
  await status.click();
  await expect(status).toHaveAttribute("data-sync-state", "conflict");
});
