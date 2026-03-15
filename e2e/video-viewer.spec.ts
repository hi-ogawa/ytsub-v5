import { expect, test } from "@playwright/test";
import { login, setupDb } from "./helper.ts";

const FIXTURE_VIDEO_ID = "7GU_VQfgMT0";

test("video-viewer settings dropdown and track label", async ({ page }) => {
  await setupDb({ seed: true });
  await login(page);

  // Pull seed data to IndexedDB via video-list sync badge
  await page.goto("/");
  const badge = page
    .getByTestId(`video-card-${FIXTURE_VIDEO_ID}`)
    .getByTestId("video-sync-badge");
  await expect(badge).toHaveAttribute("data-sync-status", "pull");
  await badge.click();
  await expect(badge).toHaveAttribute("data-sync-status", "synced");

  // Navigate to video viewer
  await page.getByTestId(`video-card-${FIXTURE_VIDEO_ID}`).click();
  await expect(page).toHaveURL(`/videos/${FIXTURE_VIDEO_ID}`);

  // Track label shows language codes
  await expect(page.getByText("ko · en")).toBeVisible();

  // Settings dropdown opens and has auto-scroll toggle
  await page.getByTitle("Settings").click();
  await expect(page.getByText("Auto-scroll")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toBeVisible();

  // Track alignment select is NOT shown in sessionOnly mode
  await expect(
    page.locator("select[title='Alignment strategy']"),
  ).not.toBeVisible();
});
