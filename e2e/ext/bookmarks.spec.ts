import { expect } from "@playwright/test";
import { setupDb } from "../helper";
import { gotoBookmarks, login, seedChromeStorage, test } from "./helper";

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

// Billlie - cloud palace
// https://www.youtube.com/watch?v=7GU_VQfgMT0
const TEST_VIDEO_ID = "7GU_VQfgMT0";

// TODO: test content script
test.skip("video page", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });

  await host.getByTestId("caption-fab").click();

  const selects = host.getByTestId("track-picker").locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");

  await host.locator("[data-index='19']").click();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({
    path: `./docs/assets/demo-${TEST_VIDEO_ID}-${timestamp}.png`,
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

  // Open login dialog via menu — invalid login shows error
  await page.getByTestId("header-menu").click();
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
  await expect(async () => {
    await page.getByTestId("header-menu").click();
    await expect(page.getByTestId("sign-in")).toBeVisible();
  }).toPass({ timeout: 10000 });
});
