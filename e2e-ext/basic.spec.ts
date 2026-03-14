import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
} from "@playwright/test";

// https://playwright.dev/docs/chrome-extensions
const test = baseTest.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const extensionPath = path.resolve("dist/extension");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        // ensure OS shows full viewport on headed mode
        `--window-size=1380,900`,
      ],
      viewport: {
        width: 1280,
        height: 800,
      },
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    await use(serviceWorker.url().split("/")[2]);
  },
});

// Billlie - cloud palace
// https://www.youtube.com/watch?v=7GU_VQfgMT0
const TEST_VIDEO_ID = "7GU_VQfgMT0";

test.skip("video page", async ({ page }) => {
  await page.goto(`https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`);

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });

  await host.getByTestId("caption-fab").click();

  const selects = host.getByTestId("track-picker").locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");

  await host.locator("[data-index='19']").click();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({
    path: `./docs/assets/demo-${TEST_VIDEO_ID}-${timestamp}.png`,
  });
});

// TODO: test
// - login / logout
// - sync
// - etc.
test("bookmarks page", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html`);
  await expect(page.locator("text=Zamak")).toBeVisible();
});
