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
  await test.step(
    "Go to bookmarks",
    async () => {
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
    },
    { box: true },
  );
}

/** Seed chrome.storage.local via the extension's service worker */
export async function seedChromeStorage(
  context: BrowserContext,
  data: Record<string, unknown>,
) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker");
  }
  await sw.evaluate((items) => chrome.storage.local.set(items), data);
}

/**
 * Write video index entries into the extension's IndexedDB from the bookmarks
 * page, then reload it to show them.
 */
export async function seedVideoIndex(page: Page, entries: object[]) {
  await page.evaluate(async (entries) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("zamak");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("videos", "readwrite");
      for (const entry of entries) {
        tx.objectStore("videos").put(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, entries);
  await page.reload();
}

/** Open a mocked YouTube watch page and wait for the content script. */
export async function openYouTubeTab(
  context: BrowserContext,
  videoId: string,
): Promise<Page> {
  return await test.step(
    "Open YouTube tab",
    async () => {
      const ytPage = await context.newPage();
      await ytPage.goto(`https://www.youtube.com/watch?v=${videoId}`);
      await expect(ytPage.locator("#zamak-host")).toBeAttached();
      return ytPage;
    },
    { box: true },
  );
}

/** Open the caption panel and select ko/en tracks */
export async function openPanelWithTracks(ytPage: Page) {
  await test.step(
    "Open caption panel with tracks",
    async () => {
      const host = ytPage.locator("#zamak-host");
      await host.getByTestId("caption-fab").click();
      const selects = host.getByTestId("track-picker").locator("select");
      await selects.nth(0).selectOption(".ko");
      await selects.nth(1).selectOption(".en");
      await expect(host.locator("[data-index='0']")).toBeVisible();
    },
    { box: true },
  );
}

/** Log in via the extension bookmarks page UI */
export async function login(page: Page, options?: { username?: string }) {
  await test.step(
    "Log in",
    async () => {
      const username = options?.username ?? "dev";
      await page.getByTestId("sign-in").click();
      await page.getByPlaceholder("Username").fill(username);
      await page.getByPlaceholder("Password").fill("devpassword");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("auth-username")).toHaveText(username);
    },
    { box: true },
  );
}
