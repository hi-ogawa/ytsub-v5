import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { setupDb } from "../helper";

// TOOD: split to e2e/ext/helper.ts
const SERVER_URL = "http://localhost:5190";

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

/** Navigate to bookmarks page with server URL override */
async function gotoBookmarks(page: Page, extensionId: string) {
  page.on("console", (msg) =>
    console.log(`[page] ${msg.type()}: ${msg.text()}`),
  );
  page.on("pageerror", (err) => console.log(`[page error] ${err}`));
  page.on("requestfailed", (req) =>
    console.log(`[request failed] ${req.url()} ${req.failure()?.errorText}`),
  );
  await page.addInitScript((url) => {
    (globalThis as Record<string, unknown>).__zamakServerUrl = url;
  }, SERVER_URL);
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html`);
}

// Billlie - cloud palace
// https://www.youtube.com/watch?v=7GU_VQfgMT0
const TEST_VIDEO_ID = "7GU_VQfgMT0";

// TODO: test content script
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

test("bookmarks page: load, login, logout", async ({ page, extensionId }) => {
  await setupDb({ seed: true });
  await gotoBookmarks(page, extensionId);

  // Page loads with empty state
  await expect(page.locator("text=Zamak")).toBeVisible();
  await expect(page.getByText("No bookmarked videos yet")).toBeVisible();

  // Open login dialog via menu
  await page.getByTestId("header-menu").click();
  await page.getByTestId("sign-in").click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();

  // Invalid login shows error
  await page.getByPlaceholder("Username").fill("nobody");
  await page.getByPlaceholder("Password").fill("wrongpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toBeVisible();

  // Valid login closes dialog and shows username
  await page.getByPlaceholder("Username").fill("dev");
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-dialog")).not.toBeVisible();
  await expect(page.getByTestId("auth-username")).toHaveText("dev");

  // Logout via menu
  await page.getByTestId("header-menu").click();
  await page.getByTestId("sign-out").click();
  await expect(async () => {
    await page.getByTestId("header-menu").click();
    await expect(page.getByTestId("sign-in")).toBeVisible();
  }).toPass({ timeout: 10000 });
});
