import { expect, test } from "@playwright/test";
import { openPulledVideo, setupDb } from "./helper.ts";

test.beforeAll(async () => {
  await setupDb({ seed: true });
});

test("pulled video opens in the viewer with its bookmarks and session-only settings", async ({
  page,
}) => {
  await openPulledVideo(page, "7GU_VQfgMT0");

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
