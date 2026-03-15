import { expect, type Page, test } from "@playwright/test";
import {
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
    await login(page);
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  });

  test("shows synced state initially, push after bookmark, navigates on click", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    const indicator = page.getByTestId("sync-status");
    await expect(indicator).toBeVisible();

    // Initially synced (no local data, no server data)
    await expect(indicator).toHaveAttribute("data-sync-state", "synced");

    // Create a bookmark — should switch to push state
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await expect(indicator).toHaveAttribute("data-sync-state", "push");

    // Click navigates to /dev (video list)
    await indicator.click();
    await expect(page).toHaveURL("/dev");
  });
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
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);
  });

  test("local video shows push badge, synced after push", async ({ page }) => {
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
  });

  test("server-only video shows pull badge, synced after pull", async ({
    page,
  }) => {
    // Create bookmark, push via video list
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await page.goto("/");
    const pushBadge = syncBadge(page, FIXTURE_VIDEO_ID);
    await pushBadge.click();
    await expect(pushBadge).toHaveAttribute("data-sync-status", "synced");

    // Clear local data to simulate fresh device
    await page.evaluate((videoId) => {
      const req = indexedDB.open("zamak");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("caption-sessions", "readwrite");
        tx.objectStore("caption-sessions").delete(videoId);
      };
      localStorage.setItem("zamak:video-index", "[]");
    }, FIXTURE_VIDEO_ID);

    // Go to video list — server-only video should appear
    await page.goto("/");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "server-only");

    // Pull
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Verify bookmark data was pulled into local
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const panel = page.getByTestId("resizable-panel");
    await expect(
      panel.getByRole("button", { name: "Bookmarks (1)" }),
    ).toBeVisible();
  });

  test("pushed video appears on server video list", async ({ page }) => {
    // Create bookmark and push via video list
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

    await page.goto("/");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Reload — video should still be there
    await page.goto("/");
    await expect(page.getByText("cloud palace")).toBeVisible();
  });
});
