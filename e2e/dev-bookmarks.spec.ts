import { expect, type Page, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

// TODO: e2e shouldn't probe internal
const VIDEO_INDEX_KEY = "zamak:video-index";

function seedVideoIndex(page: Page, entries: Record<string, unknown>[]) {
  return page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: VIDEO_INDEX_KEY, data: entries },
  );
}

const fixtureEntries = [
  {
    youtubeId: "abc123",
    title: "Test Video One",
    channelName: "Test Channel",
    bookmarkCount: 3,
    updatedAt: "2026-03-10T00:00:00.000Z",
  },
  {
    youtubeId: "def456",
    title: "Test Video Two",
    channelName: "Another Channel",
    bookmarkCount: 1,
    updatedAt: "2026-03-09T00:00:00.000Z",
  },
];

test.describe("dev-bookmarks page", () => {
  test("shows empty state when no bookmarks", async ({ page }) => {
    await page.goto("/dev/bookmarks");
    await expect(page.getByText("No bookmarked videos yet")).toBeVisible();
  });

  test("shows video cards from localStorage", async ({ page }) => {
    // Seed localStorage before navigating so the store initializes with data
    await page.goto("/dev/bookmarks");
    await seedVideoIndex(page, fixtureEntries);
    await page.goto("/dev/bookmarks");
    await expect(page.getByText("Test Video One")).toBeVisible();
    await expect(page.getByText("Test Video Two")).toBeVisible();
    await expect(page.getByText("3 bookmarks")).toBeVisible();
    await expect(page.getByText("1 bookmark")).toBeVisible();
  });

  test("does not require authentication", async ({ page }) => {
    // Navigate directly without login
    await page.goto("/dev/bookmarks");
    await expect(
      page.getByRole("heading", { name: "Bookmarked Videos" }),
    ).toBeVisible();
  });

  test("header shows Zamak (dev) branding", async ({ page }) => {
    await page.goto("/dev/bookmarks");
    await expect(page.getByText("Zamak")).toBeVisible();
    await expect(page.getByText("(dev)")).toBeVisible();
  });
});

// --- Helpers for sync tests ---

const FIXTURE_VIDEO_ID = "7GU_VQfgMT0";

async function openPanelWithTracks(page: Page) {
  await page.getByTitle("Show captions").click();
  const selects = page.locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(page.locator("[data-index='0']")).toBeVisible();
}

async function createBookmarkAt(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await page.evaluate(
    ({ index, start, end }) => {
      const sideEl = document
        .querySelector(`[data-index='${index}']`)!
        .querySelector("[data-side='0']")!;
      const textSpan = sideEl.querySelector("[data-offset]")!;
      const textNode = textSpan.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { index, start, end },
  );
  await page.getByRole("button", { name: "Create bookmark" }).click();
}

function syncBadge(page: Page, youtubeId: string) {
  return page
    .getByTestId(`video-card-${youtubeId}`)
    .getByTestId("video-sync-badge");
}

test.describe("dev-bookmarks bootstrap", () => {
  test("bootstrap fixtures seeds video index", async ({ page }) => {
    await page.goto("/dev/bookmarks");
    await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

    // Click bootstrap
    await page.getByTestId("bootstrap-fixtures").click();

    // All 3 fixture videos should appear in the video index
    await expect(page.getByTestId("video-card-7GU_VQfgMT0")).toBeVisible();
    await expect(page.getByTestId("video-card-aK8Yh3RTBUY")).toBeVisible();
    await expect(page.getByTestId("video-card-DtK-CkwNHSY")).toBeVisible();
  });
});

test.describe("dev-bookmarks sync", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);
  });

  test("no sync badges when unauthenticated", async ({ page }) => {
    // Clear cookies to be unauthenticated
    await page.context().clearCookies();
    await page.goto("/dev/bookmarks");
    await seedVideoIndex(page, fixtureEntries);
    await page.goto("/dev/bookmarks");
    await expect(page.getByText("Test Video One")).toBeVisible();
    await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
  });

  test("local video shows push badge, synced after push", async ({ page }) => {
    // Create a bookmark via dev-viewer
    await page.goto(`/dev/youtube/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, 0, 0, 3);

    // Go to bookmarks page — local-only with auth shows as "push"
    await page.goto("/dev/bookmarks");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "push");

    // Push
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });

  test("server-only video shows pull badge, synced after pull", async ({
    page,
  }) => {
    // Create bookmark and push from dev-viewer
    await page.goto(`/dev/youtube/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, 0, 0, 3);
    const devSyncBtn = page.getByTestId("sync-button");
    await devSyncBtn.click();
    await expect(devSyncBtn).toHaveAttribute("data-sync-state", "synced");

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

    // Go to bookmarks page — server-only video should appear
    await page.goto("/dev/bookmarks");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await expect(badge).toHaveAttribute("data-sync-status", "server-only");

    // Pull
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Verify bookmark data was pulled into local
    await page.goto(`/dev/youtube/${FIXTURE_VIDEO_ID}`);
    await expect(page.locator("[data-index='0']")).toBeVisible();
    const panel = page.getByTestId("resizable-panel");
    await expect(
      panel.getByRole("button", { name: "Bookmarks (1)" }),
    ).toBeVisible();
  });

  test("pushed video appears on server video list", async ({ page }) => {
    // Create bookmark and push via bookmarks page
    await page.goto(`/dev/youtube/${FIXTURE_VIDEO_ID}`);
    await openPanelWithTracks(page);
    await createBookmarkAt(page, 0, 0, 3);

    await page.goto("/dev/bookmarks");
    const badge = syncBadge(page, FIXTURE_VIDEO_ID);
    await badge.click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");

    // Server video list should show the video
    await page.goto("/");
    await expect(page.getByText("cloud palace")).toBeVisible();
  });
});
