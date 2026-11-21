import { expect, type Page, test } from "@playwright/test";
import {
  bumpServerUpdatedAt,
  createBookmarkAt,
  login,
  openPanelWithTracks,
  setupDb,
} from "./helper.ts";

const FIXTURE_VIDEO_ID = "7GU_VQfgMT0";

function syncBadge(page: Page, youtubeId: string) {
  return page
    .getByTestId(`video-card-${youtubeId}`)
    .getByTestId("video-sync-badge");
}

test.describe("dev-viewer sync indicator", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page, { username: "dev-empty" });
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  });

  test("fresh video becomes pushable with its first bookmark", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Open settings menu — sync status is inside dropdown
    await page.getByTitle("Settings").click();
    const indicator = page.getByTestId("sync-status");
    await expect(indicator).toBeVisible();

    // Fresh video without bookmarks — not in video index yet
    await expect(indicator).toHaveAttribute("data-sync-state", "empty");
    await page.keyboard.press("Escape");

    // First bookmark adds it to the video index, pushable to server
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await page.getByTitle("Settings").click();
    await expect(indicator).toHaveAttribute("data-sync-state", "push");

    // Push from the sync menu item, which stays open through the push
    await indicator.click();
    await expect(indicator).toHaveAttribute("data-sync-state", "synced");

    // The video list shows it synced too
    await page.getByRole("menuitem", { name: "Open bookmarks page" }).click();
    await expect(page).toHaveURL("/dev");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });
});

test("dev-viewer sync › pull from the sync menu replaces captions and bookmarks in place", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page);
  await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  await openPanelWithTracks(page);
  await expect(
    page.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toBeVisible();

  // Fresh local session, and the server has seed data
  await page.getByTitle("Settings").click();
  const indicator = page.getByTestId("sync-status");
  await expect(indicator).toHaveAttribute("data-sync-state", "pull");
  await indicator.click();
  await expect(indicator).toHaveAttribute("data-sync-state", "synced");

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();
});

test("dev-viewer sync › shows conflict when local bookmarks and server data both exist", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page);
  await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  await openPanelWithTracks(page);
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

  // Local bookmark + server has seed data → conflict (never synced)
  await page.getByTitle("Settings").click();
  const indicator = page.getByTestId("sync-status");
  await expect(indicator).toHaveAttribute("data-sync-state", "conflict");
});

test.describe("dev-viewer video-index", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);
  });

  test("creating bookmark populates video-list page via video-index", async ({
    page,
  }) => {
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 2 });

    // Navigate to video list and verify the video card. Navigate in the app,
    // because a page load can abort the bookmark's pending IndexedDB write.
    await page.getByRole("link", { name: "Zamak" }).click();
    const card = page.getByTestId(`video-card-${FIXTURE_VIDEO_ID}`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("video-card-title")).toHaveText(
      /cloud palace/,
    );
    await expect(card.getByTestId("video-card-channel")).toHaveText("Billlie");
    await expect(card.getByTestId("video-card-badge")).toHaveText("1 bookmark");

    // Create another bookmark, verify count updates on revisit
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    // Panel stays open (FAB state persisted from earlier in this test)
    await expect(page.locator("[data-index='0']")).toBeVisible();
    await createBookmarkAt(page, { index: 1, start: 0, end: 2 });
    await page.getByRole("link", { name: "Zamak" }).click();
    await expect(
      page
        .getByTestId(`video-card-${FIXTURE_VIDEO_ID}`)
        .getByTestId("video-card-badge"),
    ).toHaveText("2 bookmarks");
  });
});

test("opening a video without bookmarking keeps it off the video-list page", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page, { username: "dev-empty" });
  await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  await openPanelWithTracks(page);

  await page.goto("/");
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();
});

test.describe("video-list sync", () => {
  test("push badge syncs local data to server, persists after reload", async ({
    page,
  }) => {
    await setupDb({ seed: true });
    await login(page, { username: "dev-empty" });

    // Create a bookmark via dev-viewer
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Go to video list — local-only with auth shows as "push"
    await page.getByRole("link", { name: "Zamak" }).click();
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "push");

    // Push
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Reload — pushed video should still be there
    await page.goto("/");
    await expect(page.getByText("cloud palace")).toBeVisible();
  });

  test("detects pull after push + remote update", async ({ page }) => {
    await setupDb({ seed: true });
    await login(page, { username: "dev-empty" });

    // Create local bookmark and push to server
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await page.getByRole("link", { name: "Zamak" }).click();
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "push");
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Simulate another device pushing — bump server updated_at
    await bumpServerUpdatedAt(FIXTURE_VIDEO_ID);

    // Reload — should detect server is newer → pull
    await page.goto("/");
    await expect(syncBadge(page, FIXTURE_VIDEO_ID)).toHaveAttribute(
      "data-sync-status",
      "pull",
    );
  });

  test("pull badge syncs server data to local, bookmarks survive reload", async ({
    page,
  }) => {
    await setupDb({ seed: true });
    await login(page);

    // Seed video exists on server for "dev" user — no local data
    await page.goto("/");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "pull");

    // Pull
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Verify pulled data is in local video-index
    const card = page.getByTestId(`video-card-${FIXTURE_VIDEO_ID}`);
    await expect(card.getByTestId("video-card-badge")).toHaveText(
      "15 bookmarks",
    );

    // Verify pulled bookmarks survive page reload (IndexedDB persistence)
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await page.getByTitle("Show captions").click();
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const panel = page.getByTestId("resizable-panel");
    await expect(
      panel.getByRole("button", { name: "Bookmarks (15)" }),
    ).toBeVisible();
  });

  test("conflict badge resolves via dialog — upload", async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);

    // Create local bookmark on fixture video that already exists on server
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Video list should show conflict badge
    await page.getByRole("link", { name: "Zamak" }).click();
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "conflict");

    // Click opens conflict dialog, resolve by uploading local
    await badge.click();
    await page.getByRole("button", { name: "Upload local" }).click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });

  test("conflict badge resolves via dialog — download", async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);

    // Create local bookmark on fixture video that already exists on server
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Video list should show conflict badge
    await page.getByRole("link", { name: "Zamak" }).click();
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "conflict");

    // Click opens conflict dialog, resolve by downloading server
    await badge.click();
    await page.getByRole("button", { name: "Download server" }).click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });
});
