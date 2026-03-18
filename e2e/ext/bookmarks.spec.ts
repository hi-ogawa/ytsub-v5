import { expect } from "@playwright/test";
import { setupDb } from "../helper";
import {
  gotoBookmarks,
  login,
  openYouTubeTab,
  seedChromeStorage,
  seedYouTubeIdb,
  test,
} from "./helper";

const fixtureEntries = [
  {
    youtubeId: "abc123",
    title: "Test Video One",
    channelName: "Test Channel",
    bookmarkCount: 3,
    updatedAt: 1773100800,
  },
  {
    youtubeId: "def456",
    title: "Test Video Two",
    channelName: "Another Channel",
    bookmarkCount: 1,
    updatedAt: 1773014400,
  },
];

// Billlie - cloud palace (seeded on server for "dev" user)
const SEED_VIDEO_ID = "7GU_VQfgMT0";

// TODO: test content script
test.skip("video page", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${SEED_VIDEO_ID}`);

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });

  await host.getByTestId("caption-fab").click();

  const selects = host.getByTestId("track-picker").locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");

  await host.locator("[data-index='19']").click();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({
    path: `./docs/assets/demo-${SEED_VIDEO_ID}-${timestamp}.png`,
  });
});

test("bookmarks page: shows local entries without login", async ({
  context,
  page,
  extensionId,
}) => {
  await seedChromeStorage(context, { "zamak:video-index": fixtureEntries });
  await gotoBookmarks(page, extensionId);

  await expect(page.getByText("Test Video One")).toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();
  await expect(page.getByText("3 bookmarks")).toBeVisible();
  await expect(page.getByText("1 bookmark")).toBeVisible();
  await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
});

test("bookmarks page: shows local entries with sync badges after login", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await seedChromeStorage(context, { "zamak:video-index": fixtureEntries });
  await gotoBookmarks(page, extensionId);

  // Entries visible before login
  await expect(page.getByText("Test Video One")).toBeVisible();

  // Login
  await login(page);

  // Entries still visible with sync badges (2 local + 3 server-seeded = 5)
  await expect(page.getByText("Test Video One")).toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();
  const badges = page.getByTestId("video-sync-badge");
  await expect(badges).toHaveCount(5);
});

test("bookmarks page: load, login, logout", async ({ page, extensionId }) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);

  // Page loads with empty state
  await expect(page.locator("text=Zamak")).toBeVisible();
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

  // Open login dialog — invalid login shows error
  await page.getByTestId("sign-in").click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await page.getByPlaceholder("Username").fill("nobody");
  await page.getByPlaceholder("Password").fill("wrongpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toBeVisible();

  // Valid login closes dialog and shows username
  await page.getByPlaceholder("Username").fill("dev");
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-dialog")).not.toBeVisible();
  await expect(page.getByTestId("auth-username")).toHaveText("dev");

  // Logout via menu
  await page.getByTestId("header-menu").click();
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in")).toBeVisible({ timeout: 10000 });
});

test("bookmarks page: sync badges show correct states per entry", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Seed local entries: one matching server seed video (conflict/push),
  // one local-only (push)
  const localEntries = [
    {
      youtubeId: SEED_VIDEO_ID,
      title: "cloud palace",
      channelName: "Billlie",
      bookmarkCount: 2,
      updatedAt: 1773532800,
    },
    {
      youtubeId: "local-only-123",
      title: "Local Only Video",
      channelName: "Some Channel",
      bookmarkCount: 1,
      updatedAt: 1773446400,
    },
  ];
  await seedChromeStorage(context, { "zamak:video-index": localEntries });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // Seed video exists on both server and local → conflict
  const seedBadge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(seedBadge).toHaveAttribute("data-sync-status", "conflict");

  // Local-only video → push
  const localBadge = page
    .getByTestId("video-card-local-only-123")
    .getByTestId("video-sync-badge");
  await expect(localBadge).toHaveAttribute("data-sync-status", "push");
});

test("bookmarks page: server-only entries show pull badge", async ({
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // No local entries — server seed video should appear with pull badge
  const badge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
});

test("bookmarks page: push shows error toast when no YouTube tab open", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Seed a local-only entry so push badge appears
  const localEntries = [
    {
      youtubeId: "push-test-123",
      title: "Push Test Video",
      channelName: "Test",
      bookmarkCount: 1,
      updatedAt: 1773532800,
    },
  ];
  await seedChromeStorage(context, { "zamak:video-index": localEntries });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // Click push badge — should fail with "No YouTube tab open" toast
  const badge = page
    .getByTestId("video-card-push-test-123")
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");
  await badge.click();

  const errorToast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(errorToast).toBeVisible();
  await expect(errorToast).toContainText("No YouTube tab open");
});

test("bookmarks page: pull shows error toast when no YouTube tab open", async ({
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // Server-only seed video shows pull badge
  const badge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");

  // Click pull — should fail with "No YouTube tab open" toast
  await badge.click();

  const errorToast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(errorToast).toBeVisible();
  await expect(errorToast).toContainText("No YouTube tab open");
});

test("bookmarks page: push syncs local data to server via YouTube tab", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Open YouTube tab so tab RPC works
  const ytPage = await openYouTubeTab(context);

  // Seed a caption session into youtube.com's IndexedDB
  const testVideoId = "push-e2e-test";
  await seedYouTubeIdb(ytPage, {
    youtubeId: testVideoId,
    title: "Push E2E Test",
    channelName: "Test Channel",
    channelId: "UC123",
    duration: 60,
    vssId1: ".ko",
    vssId2: ".en",
    language1: "ko",
    language2: "en",
    captions: [
      {
        idx: 0,
        begin: 0,
        end: 5,
        text1: "안녕",
        text2: "hello",
        cue1Indices: [],
        cue2Indices: [],
        text1Segments: ["안녕"],
        text2Segments: ["hello"],
      },
    ],
    bookmarks: [
      {
        id: "bk-1",
        text: "안녕",
        side: 0,
        offset: 0,
        captionIndex: 0,
        timestamp: 0,
        context: "",
        createdAt: "2026-03-15T00:00:00.000Z",
      },
    ],
  });

  // Seed video-index so bookmarks page shows the entry
  await seedChromeStorage(context, {
    "zamak:video-index": [
      {
        youtubeId: testVideoId,
        title: "Push E2E Test",
        channelName: "Test Channel",
        bookmarkCount: 1,
        updatedAt: 1773532800,
      },
    ],
  });

  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  await login(page, { username: "dev-empty" });

  // Push badge should appear
  const badge = page
    .getByTestId(`video-card-${testVideoId}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");

  // Click push — should sync to server and show synced
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced", {
    timeout: 10000,
  });
});

test("bookmarks page: pull syncs server data to local via YouTube tab", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Open YouTube tab so tab RPC works
  const ytPage = await openYouTubeTab(context);

  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  await login(page);

  // Server seed video shows pull badge (no local data)
  const badge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");

  // Click pull — should sync from server and show synced
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced", {
    timeout: 10000,
  });

  // Verify pulled data shows bookmark count
  const card = page.getByTestId(`video-card-${SEED_VIDEO_ID}`);
  await expect(card.getByTestId("video-card-badge")).toHaveText("15 bookmarks");

  // Verify session was saved to youtube.com's IndexedDB
  const session = await ytPage.evaluate((videoId) => {
    return new Promise<unknown>((resolve, reject) => {
      const req = indexedDB.open("zamak", 1);
      req.onsuccess = () => {
        const tx = req.result.transaction("caption-sessions", "readonly");
        const get = tx.objectStore("caption-sessions").get(videoId);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, SEED_VIDEO_ID);
  expect(session).toBeTruthy();
});
