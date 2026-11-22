import { expect, test } from "@playwright/test";
import { createUser, openPulledVideo, SEED_VIDEO_ID } from "./helper.ts";

test("pulled video opens in the viewer with its bookmarks and session-only settings", async ({
  page,
}) => {
  const username = await createUser({ seed: true });
  await openPulledVideo(page, { username, youtubeId: SEED_VIDEO_ID });

  // Track label shows the session's languages instead of a track picker
  await expect(page.getByText("Korean · English")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();

  // Pulled bookmarks survive a reload from IndexedDB
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Bookmarks (15)" }),
  ).toBeVisible();

  // Settings has auto-scroll and sync, but no track alignment
  await page.getByTitle("Settings").click();
  await expect(page.getByText("Auto-scroll")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveAttribute(
    "data-sync-state",
    "synced",
  );
  await expect(
    page.locator("select[title='Alignment strategy']"),
  ).not.toBeVisible();
});
