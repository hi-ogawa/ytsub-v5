import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

export const SERVER_URL = "http://localhost:5190";

// https://playwright.dev/docs/chrome-extensions
export const test = baseTest.extend<{
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
export async function gotoBookmarks(page: Page, extensionId: string) {
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

/** Seed chrome.storage.local via the extension's service worker */
export async function seedChromeStorage(
  context: BrowserContext,
  data: Record<string, unknown>,
) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  await sw.evaluate((items) => chrome.storage.local.set(items), data);
}

/** Log in via the extension bookmarks page UI */
export async function login(page: Page) {
  await page.getByTestId("header-menu").click();
  await page.getByTestId("sign-in").click();
  await page.getByPlaceholder("Username").fill("dev");
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("auth-username")).toHaveText("dev");
}
