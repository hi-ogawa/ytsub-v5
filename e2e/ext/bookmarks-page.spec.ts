import { expect } from "@playwright/test";
import {
  bumpServerUpdatedAt,
  createCheckpoint,
  SEED_YOUTUBE_ID,
  setupDb,
} from "../helper";
import {
  createBookmarkAt,
  gotoBookmarks,
  login,
  openPanelWithTracks,
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

test("bookmark captions, then push them from the bookmarks page", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Bookmark the first Korean caption in the content script panel
  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, { index: 0, start: 0, end: 3 });
  await expect(host.getByRole("tab", { name: "Bookmarks (1)" })).toBeVisible();

  // The video reaches the bookmarks page without login
  await gotoBookmarks(page, extensionId);
  await page.bringToFront();
  const card = page.getByTestId(`video-card-${SEED_YOUTUBE_ID}`);
  await expect(card).toContainText("cloud palace");
  await expect(card).toContainText("Billlie");
  await expect(card.getByTestId("video-card-badge")).toHaveText("1 bookmark");

  // Another bookmark updates the count
  await createBookmarkAt(host, { index: 1, start: 0, end: 2 });
  await expect(host.getByRole("tab", { name: "Bookmarks (2)" })).toBeVisible();
  await page.reload();
  await expect(card.getByTestId("video-card-badge")).toHaveText("2 bookmarks");

  // Push the session the content script saved
  await login(page, { username: "dev-empty" });
  const badge = card.getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");
  const checkpoint = createCheckpoint();
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");
  checkpoint("push synced");
  await page.reload();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");
});

test("opening a video without bookmarking keeps it off the list", async ({
  context,
  page,
  extensionId,
}) => {
  await openPanelWithTracks(context, SEED_YOUTUBE_ID);

  await gotoBookmarks(page, extensionId);
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();
});

test("detects pull after push and a remote update", async ({
  context,
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page, { username: "dev-empty" });

  const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
  await createBookmarkAt(host, {
    index: 0,
    start: 0,
    end: 3,
  });

  await page.reload();
  const badge = page
    .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "push");
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");

  // Simulate a push from another device
  await bumpServerUpdatedAt(SEED_YOUTUBE_ID);
  await page.reload();
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
});

for (const { choice, button } of [
  { choice: "upload", button: "Upload local" },
  { choice: "download", button: "Download server" },
]) {
  test(`conflict badge resolves via dialog: ${choice}`, async ({
    context,
    page,
    extensionId,
  }) => {
    await setupDb({ seed: true });
    await gotoBookmarks(page, extensionId);
    await login(page);

    // A local bookmark on a video the server already has, never synced
    const { host } = await openPanelWithTracks(context, SEED_YOUTUBE_ID);
    await createBookmarkAt(host, {
      index: 0,
      start: 0,
      end: 3,
    });

    await page.bringToFront();
    await page.reload();
    const badge = page
      .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
      .getByTestId("video-sync-badge");
    await expect(badge).toHaveAttribute("data-sync-status", "conflict");
    await badge.click();
    await page.getByRole("button", { name: button }).click();
    await expect(badge).toHaveAttribute("data-sync-status", "synced");
  });
}

test("shows local entries without login", async ({ page, extensionId }) => {
  await gotoBookmarks(page, extensionId);
  await seedVideoIndex(page, fixtureEntries);

  await expect(page.getByText("Test Video One")).toBeVisible();
  await expect(page.getByText("Test Video Two")).toBeVisible();
  await expect(page.getByText("3 bookmarks")).toBeVisible();
  await expect(page.getByText("1 bookmark")).toBeVisible();
  await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
});

test("shows local entries with sync badges after login", async ({
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

test("load, login, logout", async ({ page, extensionId }) => {
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

test("delete removes video from list", async ({ page, extensionId }) => {
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

test("sync badges show correct states per entry", async ({
  page,
  extensionId,
}) => {
  await setupDb({ seed: true });

  // Seed local entries: one matching server seed video (conflict/push),
  // one local-only (push)
  const localEntries = [
    {
      youtubeId: SEED_YOUTUBE_ID,
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
    .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
    .getByTestId("video-sync-badge");
  await expect(seedBadge).toHaveAttribute("data-sync-status", "conflict");

  // Local-only video → push
  const localBadge = page
    .getByTestId("video-card-local-only-123")
    .getByTestId("video-sync-badge");
  await expect(localBadge).toHaveAttribute("data-sync-status", "push");
});

test("server-only entries show pull badge", async ({ page, extensionId }) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  // No local entries — server seed video should appear with pull badge
  const badge = page
    .getByTestId(`video-card-${SEED_YOUTUBE_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
});

test("push shows an error toast when the local session is missing", async ({
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

test("pull works without a YouTube tab", async ({ page, extensionId }) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);
  await login(page);

  const card = page.getByTestId(`video-card-${SEED_YOUTUBE_ID}`);
  const badge = card.getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
  const checkpoint = createCheckpoint();
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");
  checkpoint("pull synced");
  await expect(card.getByTestId("video-card-badge")).toHaveText("15 bookmarks");
});
