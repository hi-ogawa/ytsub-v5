import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
  type Locator,
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
      page.on("console", (message) => {
        if (message.type() === "error") {
          console.log(`[browser:console.error] ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        console.log(`[browser:pageerror] ${error}`);
      });
      page.on("requestfailed", (request) => {
        console.log(
          `[browser:requestfailed] ${request.url()} ${request.failure()?.errorText}`,
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
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(
    (items) => chrome.storage.local.set(items),
    data,
  );
}

/**
 * Write video index entries into the extension's IndexedDB from the bookmarks
 * page, then reload it to show them.
 */
export async function seedVideoIndex(page: Page, entries: object[]) {
  await page.evaluate(async (entries) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("zamak");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("videos", "readwrite");
      for (const entry of entries) {
        transaction.objectStore("videos").put(entry);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, entries);
  await page.reload();
}

/** Open a mocked YouTube watch page and wait for the content script. */
export async function openYouTubeTab(
  context: BrowserContext,
  youtubeId: string,
): Promise<Page> {
  return await test.step(
    "Open YouTube tab",
    async () => {
      const youtubePage = await context.newPage();
      await youtubePage.goto(`https://www.youtube.com/watch?v=${youtubeId}`);
      await expect(youtubePage.locator("#zamak-host")).toBeAttached();
      return youtubePage;
    },
    { box: true },
  );
}

/**
 * Open a mocked YouTube watch page with the caption panel showing ko/en tracks.
 * Picking the tracks saves the video's session, so a reload restores it. The
 * video isn't in the video index until it has a bookmark.
 */
export async function openPanelWithTracks(
  context: BrowserContext,
  youtubeId: string,
) {
  return await test.step(
    "Open caption panel with tracks",
    async () => {
      const youtubePage = await openYouTubeTab(context, youtubeId);
      const host = youtubePage.locator("#zamak-host");
      await host.getByTestId("caption-fab").click();
      const selects = host.getByTestId("track-picker").locator("select");
      await selects.nth(0).selectOption(".ko");
      await selects.nth(1).selectOption(".en");
      await expect(host.locator("[data-index='0']")).toBeVisible();
      return { youtubePage, host };
    },
    { box: true },
  );
}

interface CaptionSelection {
  index: number;
  start: number;
  end: number;
}

/** Select text in a caption row inside the content script's shadow root */
export async function selectTextInCaption(
  host: Locator,
  { index, start, end }: CaptionSelection,
) {
  await test.step(
    "Select caption text",
    async () => {
      await host
        .locator(`[data-index='${index}'] [data-side='0'] [data-offset]`)
        .first()
        .evaluate(
          (element, { start, end }) => {
            const range = document.createRange();
            range.setStart(element.firstChild!, start);
            range.setEnd(element.firstChild!, end);
            const selection = document.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
          },
          { start, end },
        );
    },
    { box: true },
  );
}

/** Select text in a caption row and create a bookmark */
export async function createBookmarkAt(
  host: Locator,
  selection: CaptionSelection,
) {
  await test.step(
    "Create bookmark",
    async () => {
      await selectTextInCaption(host, selection);
      await host.getByRole("button", { name: "Create bookmark" }).click();
    },
    { box: true },
  );
}

/** Open the panel's settings menu and return its sync status item */
export async function openSyncMenu(host: Locator) {
  return await test.step(
    "Open sync menu",
    async () => {
      await host.getByTitle("Settings").click();
      return host.getByTestId("sync-status");
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
