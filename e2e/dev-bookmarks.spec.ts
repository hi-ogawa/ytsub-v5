import { expect, type Page, test } from "@playwright/test";

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
    await page.goto("/dev/bookmarks");
    await seedVideoIndex(page, fixtureEntries);
    // Trigger re-render by dispatching the event used by useLocalStorage
    await page.evaluate(() =>
      window.dispatchEvent(new Event("localStorage:zamak:video-index")),
    );
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
