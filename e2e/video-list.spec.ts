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

test.describe("video-list page", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb();
    await login(page);
  });

  test("shows empty state when no bookmarks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No bookmarked videos yet")).toBeVisible();
  });

  test("shows video cards from localStorage", async ({ page }) => {
    await page.goto("/");
    await seedVideoIndex(page, fixtureEntries);
    await page.goto("/");
    await expect(page.getByText("Test Video One")).toBeVisible();
    await expect(page.getByText("Test Video Two")).toBeVisible();
    await expect(page.getByText("3 bookmarks")).toBeVisible();
    await expect(page.getByText("1 bookmark")).toBeVisible();
  });
});

test.describe("video-list bootstrap", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb();
    await login(page);
  });

  test("bootstrap fixtures seeds video index", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

    // Click bootstrap from header menu
    await page.getByTestId("header-menu").click();
    await page.getByTestId("bootstrap-fixtures").click();

    // All 3 fixture videos should appear in the video index
    await expect(page.getByTestId("video-card-7GU_VQfgMT0")).toBeVisible();
    await expect(page.getByTestId("video-card-aK8Yh3RTBUY")).toBeVisible();
    await expect(page.getByTestId("video-card-DtK-CkwNHSY")).toBeVisible();
  });
});

test.describe("video-list with seed data", () => {
  test.beforeEach(async ({ page }) => {
    await setupDb({ seed: true });
    await login(page);
  });

  test("video card shows thumbnail and channel, clicking navigates to viewer", async ({
    page,
  }) => {
    const card = page.getByRole("link", {
      name: /cloud palace/,
    });
    await expect(card).toBeVisible();
    const thumbnail = card.locator("img");
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveAttribute(
      "src",
      /img\.youtube\.com\/vi\/.+\/mqdefault\.jpg/,
    );
    await expect(card.locator("p", { hasText: "Billlie" })).toBeVisible();

    await card.click();
    await expect(page).toHaveURL(/\/videos\/.+/);
  });
});

test.describe("video-list unauthenticated", () => {
  test("no sync badges when unauthenticated", async ({ page }) => {
    await page.goto("/dev");
    await seedVideoIndex(page, fixtureEntries);
    await page.goto("/dev");
    await expect(page.getByText("Test Video One")).toBeVisible();
    await expect(page.getByTestId("video-sync-badge")).toHaveCount(0);
  });
});
