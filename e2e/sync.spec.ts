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

test.describe("dev-viewer sync", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page, { username: "dev-empty" });
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  });

  test("sync button shows push state after creating bookmark, synced after push", async ({
    page,
  }) => {
    await openPanelWithTracks(page);

    // Sync button should be visible
    const syncBtn = page.getByTestId("sync-button");
    await expect(syncBtn).toBeVisible();

    // Initially synced (no local data, no server data for dev-empty)
    await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");

    // Create a bookmark
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });

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
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
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
    await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
    await createBookmarkAt(page, { index: 1, start: 0, end: 2 });
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
    }, FIXTURE_VIDEO_ID);

    // Reload to pick up cleared state (panel stays open via persisted FAB state)
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    await expect(page.locator("[data-index='0']")).toBeVisible();

    // Should show pull state (server has data, local doesn't)
    const syncBtn2 = page.getByTestId("sync-button");
    await expect(syncBtn2).toHaveAttribute("data-sync-state", "pull");

    // Pull
    await syncBtn2.click();
    await expect(syncBtn2).toHaveAttribute("data-sync-state", "synced");

    // After pull + page reload, bookmarks should be restored from IndexedDB
    await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
    // Panel stays open via persisted FAB state, session hydrates from IndexedDB
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const panel2 = page.getByTestId("resizable-panel");
    await expect(
      panel2.getByRole("button", { name: "Bookmarks (2)" }),
    ).toBeVisible();
  });
});

test("dev-viewer sync › conflict when local and server both have data", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await login(page);
  await page.goto(`/dev/videos/${FIXTURE_VIDEO_ID}`);
  await openPanelWithTracks(page);

  // Server has seed data for "dev" — initially pull (no local data, server has data)
  const syncBtn = page.getByTestId("sync-button");
  await expect(syncBtn).toHaveAttribute("data-sync-state", "pull");

  // Create a local bookmark — now both sides have data → conflict
  await createBookmarkAt(page, { index: 0, start: 0, end: 3 });
  await expect(syncBtn).toHaveAttribute("data-sync-state", "conflict");

  // Resolve via push — conflict prompts for direction
  page.once("dialog", (dialog) => dialog.accept("push"));
  await syncBtn.click();
  await expect(syncBtn).toHaveAttribute("data-sync-state", "synced");
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
  test("local video shows push badge, synced after push", async ({ page }) => {
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
  });

  test("server-only video shows pull badge, synced after pull", async ({
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
  });

  test("conflict badge resolves via prompt", async ({ page }) => {
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

    // Resolve via push
    page.once("dialog", (dialog) => dialog.accept("push"));
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });

  test("pushed video appears on server video list", async ({ page }) => {
    await setupDb({ seed: true });
    await login(page, { username: "dev-empty" });

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
