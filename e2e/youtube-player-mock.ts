import type { BrowserContext, Page } from "@playwright/test";

/**
 * Replace the YouTube IFrame API with a fake `YT.Player` and block every other
 * YouTube request. The fake records the commands the app sends so a test can
 * check them with `getPlayerCalls`. A real player smoke test belongs in
 * `pnpm test-youtube`.
 */
export async function mockYouTubePlayer(context: BrowserContext) {
  await context.route("https://www.youtube.com/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/iframe_api") {
      await route.fulfill({
        contentType: "text/javascript",
        body: `(${installFakeYouTubePlayer})()`,
      });
      return;
    }
    await route.abort();
  });
  // The bookmarks page shows video thumbnails from img.youtube.com.
  await context.route("https://img.youtube.com/**", (route) =>
    route.fulfill({ contentType: "image/gif", body: TRANSPARENT_GIF }),
  );
}

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export type PlayerCall =
  | { method: "playVideo" | "pauseVideo" }
  | { method: "seekTo"; seconds: number };

interface FakeYouTubePlayerState {
  ready: boolean;
  calls: PlayerCall[];
}

declare global {
  interface Window {
    fakeYouTubePlayer?: FakeYouTubePlayerState;
  }
}

/** Wait until the page's player has fired `onReady`. */
export async function waitForPlayer(page: Page) {
  await page.waitForFunction(() => window.fakeYouTubePlayer?.ready);
}

export async function getPlayerCalls(page: Page) {
  return page.evaluate(() => window.fakeYouTubePlayer!.calls);
}

// Runs in the page as the body of the `iframe_api` script, so it must not
// reference anything outside itself.
function installFakeYouTubePlayer() {
  const PLAYING = 1;
  const PAUSED = 2;
  const CUED = 5;
  const state: FakeYouTubePlayerState = { ready: false, calls: [] };
  window.fakeYouTubePlayer = state;

  function FakePlayer(
    el: HTMLElement,
    options: { events?: { onReady?: () => void } },
  ) {
    let time = 0;
    let playerState = CUED;
    el.textContent = "Fake YouTube player (e2e/youtube-player-mock.ts)";
    el.style.cssText =
      "display:grid;place-items:center;background:#ddd;color:#888";
    setTimeout(() => {
      options.events?.onReady?.();
      state.ready = true;
    });
    return {
      playVideo() {
        state.calls.push({ method: "playVideo" });
        playerState = PLAYING;
      },
      pauseVideo() {
        state.calls.push({ method: "pauseVideo" });
        playerState = PAUSED;
      },
      seekTo(seconds: number) {
        state.calls.push({ method: "seekTo", seconds });
        time = seconds;
      },
      getCurrentTime: () => time,
      getPlayerState: () => playerState,
      destroy() {},
    };
  }

  // `new YT.Player(...)` returns the object the constructor function returns.
  Object.assign(window, { YT: { Player: FakePlayer } });
  (
    window as unknown as { onYouTubeIframeAPIReady?: () => void }
  ).onYouTubeIframeAPIReady?.();
}
