import { expect, test } from "@playwright/test";
import { login, openPulledVideo, SEED_YOUTUBE_ID, setupDb } from "./helper.ts";

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

test("server-only video is pulled when the viewer opens it", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/**", (route) => route.abort());
  await login(page);

  await page.goto(`/videos/${SEED_YOUTUBE_ID}`);
  await expect(page.getByRole("tab", { name: "Bookmarks (15)" })).toBeVisible();
  await page.getByTitle("Settings").click();
  await expect(page.getByTestId("sync-status")).toHaveAttribute(
    "data-sync-state",
    "synced",
  );

  // A video the server doesn't have either links back to the list
  await page.goto("/videos/notOnServer");
  await expect(page.getByText("This video isn't on the server")).toBeVisible();
  await page.getByRole("button", { name: "Open bookmarked videos" }).click();
  await expect(page).toHaveURL("/");
});
