import path from "node:path";
import {
  test as baseTest,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const SERVER_URL = "http://localhost:5190";

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
  await page.addInitScript((url) => {
    (globalThis as any).__zamakServerUrl = url;
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

/**
 * Open a YouTube video tab so the content script + relay load,
 * enabling tab RPC (push/pull) from the bookmarks page.
 * Uses a non-existent video ID for fast loading (no heavy YouTube JS/ads).
 * Waits for #zamak-host to confirm content script is ready.
 */
export async function openYouTubeTab(context: BrowserContext): Promise<Page> {
  const ytPage = await context.newPage();
  await ytPage.goto("https://www.youtube.com/watch?v=not-found");
  await expect(ytPage.locator("#zamak-host")).toBeAttached({ timeout: 15_000 });
  return ytPage;
}

/**
 * Seed IndexedDB on the YouTube tab's origin with a caption session.
 * This makes push possible from the bookmarks page via tab RPC.
 */
export async function seedYouTubeIdb(
  ytPage: Page,
  session: Record<string, unknown>,
) {
  await ytPage.evaluate((data) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("zamak", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("caption-sessions", {
          keyPath: "youtubeId",
        });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("caption-sessions", "readwrite");
        tx.objectStore("caption-sessions").put(data);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, session);
}

/** Log in via the extension bookmarks page UI */
export async function login(page: Page, options?: { username?: string }) {
  const username = options?.username ?? "dev";
  await page.getByTestId("header-menu").click();
  await page.getByTestId("sign-in").click();
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Password").fill("devpassword");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("auth-username")).toHaveText(username);
}
