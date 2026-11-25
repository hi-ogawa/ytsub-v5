import { expect, test } from "@playwright/test";
import { openPulledVideo, SEED_YOUTUBE_ID, setupDb } from "./helper.ts";

test.use({ hasTouch: true });

test("dropdown toggles on tap but not on a scroll that starts on its trigger", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await openPulledVideo(page, SEED_YOUTUBE_ID);

  const trigger = page.getByTitle("Settings");
  const menu = page.getByRole("menu");
  const box = (await trigger.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    yDistance: -200,
    gestureSourceType: "touch",
  });
  await expect(menu).not.toBeVisible();

  await trigger.tap();
  await expect(menu).toBeVisible();
  await page.touchscreen.tap(5, 5);
  await expect(menu).not.toBeVisible();

  // A tap on the trigger of an open menu closes it, rather than closing and
  // reopening it. Tap by position, because the modal menu sets
  // pointer-events:none on the page, which fails locator.tap()'s checks.
  await trigger.tap();
  await expect(menu).toBeVisible();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(menu).not.toBeVisible();
});
