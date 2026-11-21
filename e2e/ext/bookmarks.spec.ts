import { expect } from "@playwright/test";
import { createCheckpoint, setupDb } from "../helper";
import {
  gotoBookmarks,
  login,
  openPanelWithTracks,
  openYouTubeTab,
  seedVideoIndex,
  test,
} from "./helper";

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

// Billlie - cloud palace (seeded on server for "dev" user)
const SEED_VIDEO_ID = "7GU_VQfgMT0";

test("video page: bookmark a caption, then push it from the bookmarks page", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Bookmark the first Korean caption in the content script panel
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  await host
    .locator("[data-index='0'] [data-side='0'] [data-offset]")
    .selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  await expect(
    host.getByRole("button", { name: "Bookmarks (1)" }),
  ).toBeVisible();

  // The video reaches the bookmarks page without login
  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  const card = page.getByTestId(`video-card-${SEED_VIDEO_ID}`);
  await expect(card).toContainText("cloud palace");
  await expect(card.getByTestId("video-card-badge")).toHaveText("1 bookmark");

  // Push the session the content script saved
  await login(page, { username: "dev-empty" });
  const badge = card.getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");
  const checkpoint = createCheckpoint();
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");
  checkpoint("push synced");
});

test("video page: clicks inside the bookmark popover don't reach the caption row", async ({
  context,
}) => {
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  await host
    .locator("[data-index='1'] [data-side='0'] [data-offset]")
    .selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  const video = ytPage.locator("video");
  const isPaused = () => video.evaluate((el: HTMLVideoElement) => el.paused);

  await host
    .locator("[data-index='1']")
    .getByTestId("bookmark-highlight")
    .click();
  const popover = host.getByTestId("bookmark-popover");
  await popover.getByText("unfilled").click();
  await expect(popover).toBeVisible();
  expect(await isPaused()).toBe(true);

  // A click on the row itself seeks and plays
  await host.locator("[data-index='2']").click();
  await expect.poll(isPaused).toBe(false);
});

test("video page: bookmark arrows keep the play state", async ({ context }) => {
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  await host
    .locator("[data-index='1'] [data-side='0'] [data-offset]")
    .selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  const video = ytPage.locator("video");
  const isPaused = () => video.evaluate((el: HTMLVideoElement) => el.paused);
  const getCurrentTime = () =>
    video.evaluate((el: HTMLVideoElement) => el.currentTime);

  // A paused video stays paused at the bookmark
  expect(await isPaused()).toBe(true);
  await host.getByRole("button", { name: "Next bookmark" }).click();
  await expect.poll(getCurrentTime).toBeGreaterThan(0);
  expect(await isPaused()).toBe(true);

  // A playing video keeps playing
  await host.locator("[data-index='2']").click();
  await expect.poll(isPaused).toBe(false);
  await host.getByRole("button", { name: "Previous bookmark" }).click();
  expect(await isPaused()).toBe(false);
});

test("video page: bookmark arrows show the caption while paused", async ({
  context,
}) => {
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  const row = host.locator("[data-index='30']");
  await row.locator("[data-side='0'] [data-offset]").selectText();
  await host.getByRole("button", { name: "Create bookmark" }).click();
  await host.locator("[data-index='0']").scrollIntoViewIfNeeded();
  await expect(row).not.toBeInViewport();

  await host.getByRole("button", { name: "Next bookmark" }).click();
  const getOffsetFromCenter = () =>
    row.evaluate((el) => {
      const list = el.closest(".overflow-y-auto")!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return Math.abs(
        rect.top + rect.height / 2 - (list.top + list.height / 2),
      );
    });
  await expect.poll(getOffsetFromCenter).toBeLessThan(2);
  await expect(row).toHaveClass(/border-ring/);
});

test("bookmarks page: shows local entries without login", async ({
  page,
  extensionId,
}) => {
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, fixtureEntries);

  await expect(page.getByText("Test Video One")).toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();
  await expect(page.getByText("3 bookmarks")).toBeVisible();
  await expect(page.getByText("1 bookmark")).toBeVisible();
  await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
});

test("bookmarks page: shows local entries with sync badges after login", async ({
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, fixtureEntries);

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
  await expect(page.getByTestId("sign-in")).toBeVisible();
});

test("bookmarks page: delete removes video from list", async ({
  page,
  extensionId,
}) => {
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, fixtureEntries);

  // Both entries visible
  await expect(page.getByText("Test Video One")).toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();

  // Open card menu and click delete on first video
  const card = page.getByTestId("video-card-abc123");
  await card.getByTestId("video-card-menu").click();

  // Accept the confirmation dialog
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByText("Delete").click();

  // First video removed, second still visible
  await expect(page.getByText("Test Video One")).not.toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();
});

test("bookmarks page: sync badges show correct states per entry", async ({
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
      updatedAt: "2026-03-15T00:00:00.000Z",
    },
    {
      youtubeId: "local-only-123",
      title: "Local Only Video",
      channelName: "Some Channel",
      bookmarkCount: 1,
      updatedAt: "2026-03-14T00:00:00.000Z",
    },
  ];
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, localEntries);
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

test("bookmarks page: push shows an error toast when the local session is missing", async ({
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
      updatedAt: "2026-03-15T00:00:00.000Z",
    },
  ];
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, localEntries);
  await login(page);

  // The index has an entry, but no session to push
  const badge = page
    .getByTestId("video-card-push-test-123")
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");
  await badge.click();

  const errorToast = page.locator("[data-sonner-toast][data-type='error']");
  await expect(errorToast).toBeVisible();
  await expect(errorToast).toContainText("No local session found");
});

test("bookmarks page: pull works without a YouTube tab", async ({
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const card = page.getByTestId(`video-card-${SEED_VIDEO_ID}`);
  const badge = card.getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
  const checkpoint = createCheckpoint();
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");
  checkpoint("pull synced");
  await expect(card.getByTestId("video-card-badge")).toHaveText("15 bookmarks");
});

test("bookmarks page: a pull reaches the panel open in a YouTube tab", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  const ytPage = await openYouTubeTab(context, SEED_VIDEO_ID);
  await openPanelWithTracks(ytPage);
  const host = ytPage.locator("#zamak-host");
  await expect(
    host.getByRole("button", { name: "Bookmarks", exact: true }),
  ).toBeVisible();

  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  await login(page);
  const badge = page
    .getByTestId(`video-card-${SEED_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");

  // The open panel rereads the pulled session, without a reload
  await expect(
    host.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();
  await host.getByTitle("Settings").click();
  await expect(host.getByTestId("sync-status")).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
});
