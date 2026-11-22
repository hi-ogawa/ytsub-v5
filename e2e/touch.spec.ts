import { expect, test } from "@playwright/test";
import { openPulledVideo, SEED_VIDEO_ID, setupDb } from "./helper.ts";

test.use({ hasTouch: true });

test("dropdown opens on tap but not on a scroll that starts on its trigger", async ({
  page,
}) => {
  await setupDb({ seed: true });
  await openPulledVideo(page, SEED_VIDEO_ID);

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
