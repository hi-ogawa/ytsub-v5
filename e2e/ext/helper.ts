import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mockYouTube } from "./youtube-mock";

const SERVER_URL = `http://localhost:${process.env.E2E_PORT}`;

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
    await mockYouTube(context);
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
  // surface client errors on playwright cli console
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[browser:console.error] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[browser:pageerror] ${err}`);
  });
  page.on("requestfailed", (req) => {
    console.log(
      `[browser:requestfailed] ${req.url()} ${req.failure()?.errorText}`,
    );
  });
  // Override server URL for via chrome.storage.local
  await seedChromeStorage(page.context(), { serverUrl: SERVER_URL });
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

/**
 * Open a mocked YouTube watch page and wait for the content script.
 * The tab also gives the bookmarks page a tab for push and pull (tab RPC).
 */
export async function openYouTubeTab(
  context: BrowserContext,
  videoId: string,
): Promise<Page> {
  const ytPage = await context.newPage();
  await ytPage.goto(`https://www.youtube.com/watch?v=${videoId}`);
  await expect(ytPage.locator("#zamak-host")).toBeAttached();
  return ytPage;
}

/** Open the caption panel and select ko/en tracks */
export async function openPanelWithTracks(ytPage: Page) {
  const host = ytPage.locator("#zamak-host");
  await host.getByTestId("caption-fab").click();
  const selects = host.getByTestId("track-picker").locator("select");
  await selects.nth(0).selectOption(".ko");
  await selects.nth(1).selectOption(".en");
  await expect(host.locator("[data-index='0']")).toBeVisible();
}

/** Log in via the extension bookmarks page UI */
export async function login(page: Page, options?: { username?: string }) {
  const username = options?.username ?? "dev";
  await page.getByTestId("sign-in").click();
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("auth-username")).toHaveText(username);
}
