import { expect, test } from "@playwright/test";
import { createUser, openPulledVideo, SEED_YOUTUBE_ID } from "./helper.ts";

test.use({ hasTouch: true });

test("dropdown opens on tap but not on a scroll that starts on its trigger", async ({
  page,
}) => {
  const username = await createUser({ seed: true });
  await openPulledVideo(page, { username, youtubeId: SEED_YOUTUBE_ID });

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
});
