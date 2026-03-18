# Extension Testing Strategy

## Problem

The content script (YouTube video page overlay) is the most important UI surface but has **zero automated test coverage**. The only content script test (`bookmarks.spec.ts` line 33) is `test.skip`. Current extension e2e tests only cover the bookmarks page.

The challenge: testing the content script requires a real YouTube page, but real YouTube is slow (ads, heavy JS) and non-deterministic (videos get removed, captions change).

## Key Insight: `v=not-found` + API Interception

`openYouTubeTab(context)` already navigates to `youtube.com/watch?v=not-found` — YouTube loads its shell (including `ytcfg` with `visitorData`) but shows "Video unavailable". The content script injects `#zamak-host` and runs normally. It then calls `fetchPlayerApi()` which POSTs to `youtube.com/youtubei/v1/player`.

**If we intercept that POST and return fixture data**, the content script gets metadata + caption tracks with `baseUrl`s we control. When it fetches those track URLs, we intercept again and return fixture JSON3 data. The entire content script flow runs end-to-end with deterministic data, no real video needed.

## What Needs Testing

Content script features not testable via `/dev` routes:

| Feature                          | Why extension-only                                         |
| -------------------------------- | ---------------------------------------------------------- |
| Shadow DOM injection             | `#zamak-host` creation, style isolation                    |
| FAB toggle on YouTube            | Interaction with YouTube's layout, z-index                 |
| Caption fetch pipeline           | `fetchPlayerApi()` → track selection → `fetchTrackJson3()` |
| Track picker + language switch   | Reloads tracks via real fetch path                         |
| YouTube video player integration | `seekTo`, `getCurrentTime`, highlight sync                 |
| RPC (content → background)       | Sync state badge, `openBookmarks()`                        |
| Tab RPC (background → content)   | Push/pull via `getSession`/`saveSession`                   |
| YouTube SPA navigation           | `yt-navigate-start`/`yt-navigate-finish` cleanup/re-inject |
| Dark/light theme adaptation      | Observes YouTube's `[dark]` attribute                      |

## Approach

### Tier 1: Manual Testing Script

**Purpose:** Quick interactive testing during development. Launch a persistent Chrome profile with the extension loaded and pre-configured scenarios.

**Script: `scripts/manual-ext-test.ts`** (run with `node`)

```ts
// Launches Chromium with extension loaded in a persistent profile.
// Developer navigates manually, extension state is preserved between runs.
import { chromium } from "playwright";

const context = await chromium.launchPersistentContext(
  "tmp/ext-profile", // reusable profile dir
  {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=dist/extension`,
      `--load-extension=dist/extension`,
      "--window-size=1380,900",
    ],
    viewport: { width: 1280, height: 800 },
  },
);

// Override server URL
const [sw] = context.serviceWorkers();
await sw.evaluate((items) => chrome.storage.local.set(items), {
  serverUrl: "http://localhost:5190",
});

// Scenario setup — pick via CLI arg
const scenario = process.argv[2] ?? "default";

if (scenario === "fixture") {
  // Open v=not-found with API interception → fixture captions
  const page = await context.newPage();
  await setupRouteInterception(page, "7GU_VQfgMT0");
  await page.goto("https://www.youtube.com/watch?v=not-found");
}
if (scenario === "real") {
  // Open a real video (requires network)
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/watch?v=7GU_VQfgMT0");
}
if (scenario === "bookmarks") {
  // Open bookmarks page with seeded data
  const extensionId = sw.url().split("/")[2];
  await sw.evaluate((items) => chrome.storage.local.set(items), {
    "zamak:video-index": [
      {
        youtubeId: "abc",
        title: "Test Video",
        channelName: "Ch",
        bookmarkCount: 3,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html`);
}

console.log(
  `[manual-ext-test] scenario="${scenario}" — browser open, Ctrl+C to exit`,
);
// Keep alive until Ctrl+C
await new Promise(() => {});
```

**Usage:**

```sh
pnpm build-ext && node scripts/manual-ext-test.ts              # default: just opens browser
pnpm build-ext && node scripts/manual-ext-test.ts fixture      # v=not-found with fixture captions
pnpm build-ext && node scripts/manual-ext-test.ts real         # real YouTube video
pnpm build-ext && node scripts/manual-ext-test.ts bookmarks    # bookmarks page with seed data
```

**Advantages over "just open Chrome manually":**

- Extension auto-loaded, server URL pre-configured
- Persistent profile: keeps login, IDB, chrome.storage between runs
- Scriptable scenarios — add new ones as needed
- Route interception available for fixture mode

### Tier 2: Automated E2E — Content Script Tests

**New file: `e2e/ext/content-script.spec.ts`**

Uses the `v=not-found` + Playwright `page.route()` interception pattern.

#### Interception Mechanism

Two endpoints to intercept:

1. **`/youtubei/v1/player`** (POST) → return fixture `metadata.json` transformed to YouTube player API response format
2. **`/api/timedtext*`** (GET) → match `lang` + `kind` params to fixture `track-*.json` files

```ts
// e2e/ext/intercept.ts — shared route interception helper

import fs from "node:fs";
import path from "node:path";

const FIXTURES_DIR = "scripts/youtube-json";

interface InterceptOptions {
  videoId: string; // fixture directory name (e.g. "7GU_VQfgMT0")
  fixtureDir?: string; // override fixture path
}

/**
 * Intercept YouTube API calls on a page and return fixture data.
 * Must be called BEFORE navigating to youtube.com.
 */
export async function interceptYouTubeApi(
  page: Page,
  options: InterceptOptions,
) {
  const dir = options.fixtureDir ?? path.join(FIXTURES_DIR, options.videoId);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(dir, "metadata.json"), "utf-8"),
  );

  // 1. Intercept player API → return fixture metadata as YouTube API response
  await page.route("**/youtubei/v1/player", async (route) => {
    const response = buildPlayerApiResponse(metadata, options.videoId);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  // 2. Intercept timedtext (caption track) requests → return fixture JSON3
  await page.route("**/api/timedtext*", async (route) => {
    const url = new URL(route.request().url());
    const lang = url.searchParams.get("lang");
    const kind = url.searchParams.get("kind");
    const tlang = url.searchParams.get("tlang");

    // Build vssId to match fixture file naming: "a.ko", ".en", ".ko.t.en"
    let vssId: string;
    if (tlang) {
      // Auto-translated track
      const srcVssId = kind === "asr" ? `a.${lang}` : `.${lang}`;
      vssId = `${srcVssId}.t.${tlang}`;
    } else {
      vssId = kind === "asr" ? `a.${lang}` : `.${lang}`;
    }

    const trackFile = path.join(dir, `track-${vssId}.json`);
    if (fs.existsSync(trackFile)) {
      const data = fs.readFileSync(trackFile, "utf-8");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: data,
      });
    } else {
      // Track not in fixtures — let it fail gracefully
      await route.fulfill({ status: 404, body: "Track not found in fixtures" });
    }
  });
}

/**
 * Transform our fixture metadata.json into YouTube's player API response format.
 * The content script parses videoDetails + captions from this response.
 * Caption baseUrls point to youtube.com/api/timedtext (which we also intercept).
 */
function buildPlayerApiResponse(metadata: FixtureMetadata, videoId: string) {
  return {
    videoDetails: {
      videoId: metadata.video.youtubeId,
      title: metadata.video.title,
      author: metadata.video.channelName,
      channelId: metadata.video.channelId,
      lengthSeconds: String(metadata.video.duration),
    },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: metadata.captionTracks.map((t) => ({
          baseUrl: buildFixtureBaseUrl(t, videoId),
          languageCode: t.languageCode,
          kind: t.kind,
          name: { simpleText: t.name },
          vssId: t.vssId,
        })),
      },
    },
  };
}

/** Build a baseUrl that will be intercepted by our timedtext route handler. */
function buildFixtureBaseUrl(track: CaptionTrack, videoId: string): string {
  const url = new URL("https://www.youtube.com/api/timedtext");
  url.searchParams.set("v", videoId);
  url.searchParams.set("lang", track.languageCode);
  if (track.kind) url.searchParams.set("kind", track.kind);
  return url.toString();
}
```

#### Test Structure

```ts
// e2e/ext/content-script.spec.ts

test("content script injects and loads captions via fixture", async ({
  context,
}) => {
  const page = await context.newPage();
  await interceptYouTubeApi(page, { videoId: "7GU_VQfgMT0" });
  await page.goto("https://www.youtube.com/watch?v=not-found");

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });

  // Open panel
  const shadow = host.locator("internal:shadow=*"); // or use shadow root access
  await host.getByTestId("caption-fab").click();

  // Captions loaded from intercepted fixture data
  await expect(host.locator("[data-index='0']")).toBeVisible({
    timeout: 10_000,
  });

  // Verify dual-language content from ko+en fixture tracks
  const firstRow = host.locator("[data-index='0']");
  await expect(firstRow).toContainText(/[가-힣]/); // Korean text present
});

test("track picker switches languages", async ({ context }) => {
  const page = await context.newPage();
  await interceptYouTubeApi(page, { videoId: "7GU_VQfgMT0" });
  await page.goto("https://www.youtube.com/watch?v=not-found");

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });
  await host.getByTestId("caption-fab").click();
  await expect(host.locator("[data-index='0']")).toBeVisible({
    timeout: 10_000,
  });

  // Switch track 2 from en → ja
  const pickers = host.getByTestId("track-picker").locator("select");
  await pickers.nth(1).selectOption(".ja");

  // Verify Japanese content loads
  await expect(host.locator("[data-index='0']")).toContainText(
    /[ぁ-ん|ァ-ヶ|一-龠]/,
  );
});

test("click caption row seeks video", async ({ context }) => {
  const page = await context.newPage();
  await interceptYouTubeApi(page, { videoId: "7GU_VQfgMT0" });
  await page.goto("https://www.youtube.com/watch?v=not-found");

  const host = page.locator("#zamak-host");
  await expect(host).toBeAttached({ timeout: 15_000 });
  await host.getByTestId("caption-fab").click();
  await expect(host.locator("[data-index='5']")).toBeVisible({
    timeout: 10_000,
  });

  // Click a caption row — video should seek
  await host.locator("[data-index='5']").click();
  const currentTime = await page.evaluate(
    () => document.querySelector("video")?.currentTime,
  );
  expect(currentTime).toBeGreaterThan(0);
});

test("bookmarking works on intercepted page", async ({ context }) => {
  // ... select text in caption, create bookmark, verify in bookmarks tab
});

test("sync state badge shows on panel", async ({ context }) => {
  // ... login via background RPC mock, verify sync badge in caption panel header
});
```

#### Shadow DOM Access

The content script renders inside `#zamak-host` with a shadow root. Playwright supports shadow DOM piercing:

- `page.locator("#zamak-host")` finds the host
- `host.getByTestId("caption-fab")` automatically pierces shadow roots
- This already works — the skipped test in `bookmarks.spec.ts` uses this pattern

#### Dealing with `visitorData`

`fetchPlayerApi()` extracts `visitorData` from `window.ytcfg.data_`. On `v=not-found`, YouTube still sets `ytcfg` (it's part of the page shell). If it doesn't, we can inject it:

```ts
await page.addInitScript(() => {
  (window as any).ytcfg = {
    data_: { VISITOR_DATA: "fake-visitor-data-for-testing" },
  };
});
```

But `addInitScript` runs in MAIN world — same as the content script (world: MAIN). Need to verify timing. Alternative: intercept the response and check `ytcfg` is present on `v=not-found` pages (it should be — YouTube always sets it).

### Tier 3: What Stays on `/dev` Routes

The `/dev` routes remain the **primary testing surface** for caption panel UI logic:

- Caption rendering, scrolling, highlighting
- Bookmark creation, editing, export
- AI prompt generation
- Track picker UI interactions

These are faster (no YouTube page load, no extension), parallelizable, and cover the shared components. Extension content script tests focus on **integration** — the glue between YouTube's page and our components.

## Test Matrix

| What                                    | Where                                              | Speed               | Network            |
| --------------------------------------- | -------------------------------------------------- | ------------------- | ------------------ |
| Caption panel UI (render, scroll, tabs) | `/dev` routes (dev-viewer.spec.ts)                 | Fast (~0.5s/test)   | None               |
| Bookmarks page (list, badges, sync)     | Extension (ext/bookmarks.spec.ts)                  | Medium (~1.5s/test) | Server only        |
| Content script integration              | Extension + intercept (ext/content-script.spec.ts) | Medium (~3s/test)   | YouTube page shell |
| Full real-video flow                    | Manual script                                      | Slow                | Full YouTube       |

## Implementation Steps

1. **Verify `v=not-found` baseline**: confirm `ytcfg`/`visitorData` is set, `#zamak-host` injects, `fetchPlayerApi` fires (check devtools network tab manually)
2. **Build `interceptYouTubeApi` helper** in `e2e/ext/intercept.ts` — player API + timedtext route interception using fixture data
3. **Write first content script test**: injection + FAB + caption load with intercepted data
4. **Expand**: track switching, click-to-seek, bookmarking, sync badge
5. **Build manual test script**: `scripts/manual-ext-test.ts` with scenario modes
6. **Update AGENTS.md**: document new test file and patterns

## Open Questions

- **`page.route()` + extension content script timing**: Playwright's route interception works on the page's network layer. Since content.js runs in MAIN world (same page context), `fetch()` calls from the content script should be interceptable. Need to verify this works with the extension's service worker in the picture.
- **Shadow DOM test selectors**: the skipped test already uses `host.getByTestId()` which should pierce shadow roots. Need to confirm `locator("[data-index='N']")` also works through shadow DOM — if not, use `page.locator("#zamak-host >> [data-index='0']")` piercing syntax.
- **`visitorData` on `v=not-found`**: does YouTube set `ytcfg.data_.VISITOR_DATA` on error pages? If not, we need `addInitScript` to inject it before the content script reads it.

## Status

- Planning phase — awaiting feedback before implementation
