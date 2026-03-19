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

  test("shows synced state initially, push after bookmark, navigates on click", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Open settings menu — sync status is inside dropdown
    await page.getByTitle("Settings").click();
    const indicator = page.getByTestId("sync-status");
    await expect(indicator).toBeVisible();

    // TODO: should be "push" once session lifecycle is action-based
    // (see docs/tasks/2026-03-18-sync-caption-sessions.md)
    await expect(indicator).toHaveAttribute("data-sync-state", "unknown");

    // Close dropdown, create a bookmark
    await page.keyboard.press("Escape");
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    // Reopen dropdown — should show push state
    await page.getByTitle("Settings").click();
    await expect(indicator).toHaveAttribute("data-sync-state", "push");

    // Click navigates to /dev (video list)
    await indicator.click();
    await expect(page).toHaveURL("/dev");
  });
});

test("dev-viewer sync › shows pull then conflict states for seeded user", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page);
  await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  await openPanelWithTracks(page);

  // Server has seed data for "dev" — indicator shows pull (no local data, server has data)
  await page.getByTitle("Settings").click();
  const indicator = page.getByTestId("sync-status");
  // May briefly show "checking" while server query completes
  await expect(indicator).toHaveAttribute("data-sync-state", "pull", {
    timeout: 5000,
  });

  // Create a local bookmark — now both sides have data → conflict
  await page.keyboard.press("Escape");
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
  await page.getByTitle("Settings").click();
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

    // Navigate to video list and verify the video card
    await page.goto("/");
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
    await page.goto("/");
    await expect(
      page
        .getByTestId(`video-card-${FIXTURE_VIDEO_ID}`)
        .getByTestId("video-card-badge"),
    ).toHaveText("2 bookmarks");
  });
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
    await page.goto("/");
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
    await page.goto("/");
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
    await page.goto("/");
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
    await page.goto("/");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "conflict");

    // Click opens conflict dialog, resolve by downloading server
    await badge.click();
    await page.getByRole("button", { name: "Download server" }).click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });
});
