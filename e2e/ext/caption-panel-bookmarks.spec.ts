import { expect } from "@playwright/test";
import { openPanelWithTracks, openYouTubeTab, test } from "./helper";

// Billlie - cloud palace
const SEED_VIDEO_ID = "7GU_VQfgMT0";

test("clicks inside the bookmark popover don't reach the caption row", async ({
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

test("bookmark arrows keep the play state", async ({ context }) => {
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

test("bookmark arrows show the caption while paused", async ({ context }) => {
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
