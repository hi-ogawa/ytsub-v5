import { expect, test } from "@playwright/test";
import { openPulledVideo, SEED_YOUTUBE_ID, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("pulled video opens in the viewer with its bookmarks and session-only settings", async ({
  page,
}) => {
  await openPulledVideo(page, SEED_YOUTUBE_ID);

  // Track label shows the session's languages instead of a track picker
  await expect(page.getByText("Korean · English")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bookmarks (15)" })).toBeVisible();

  // Pulled bookmarks survive a reload from IndexedDB
  await page.reload();
  await expect(page.getByRole("tab", { name: "Bookmarks (15)" })).toBeVisible();

  // Settings has auto-scroll and sync
  await page.getByTitle("Settings").click();
  await expect(page.getByText("Auto-scroll")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
});
