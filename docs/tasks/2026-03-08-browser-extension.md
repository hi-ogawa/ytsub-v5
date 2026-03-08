# Browser Extension for Subtitle Import

## Problem

The ytsub import pipeline currently depends on yt-dlp (local CLI) + an AI agent for subtitle fetching. A browser extension can replace both by extracting subtitles directly from YouTube via same-origin access.

This is Phase 1 of the AI-less workflow (see `2026-03-08-ai-less-workflow.md`).

## Prior Art: ytsub-v4

ytsub-v4 (`~/code/personal/ytsub-v4`) is a full browser extension that embeds a caption viewer directly into YouTube pages. It proves the subtitle extraction approach works. Key reference files:

- `src/utils/youtube.ts` — YouTube API client (metadata + subtitle fetching)
- `src/entrypoints/content/main.ts` — content script logic
- `src/entrypoints/content-iframe/root.tsx` — caption viewer UI (embedded in YouTube)
- `wxt.config.ts` — Manifest V3 configuration

### What v4 does that we need

**Subtitle fetching via YouTube internal API:**

1. Fetch the YouTube watch page HTML, extract `visitorData` from `ytcfg.set(...)` config object
2. Call `https://www.youtube.com/youtubei/v1/player` with spoofed iOS client headers + visitorData
3. Response includes `captions.playerCaptionsTracklistRenderer.captionTracks[]` — each track has a `baseUrl`
4. Fetch each track's `baseUrl` with `&fmt=json3` to get JSON3 subtitle data
5. Parse JSON3 events into `{ begin, end, text }` cue arrays

**Caption alignment (heuristic):**

1. Simple mode: if both tracks have identical `{begin, end}` timestamps, pair 1:1
2. Heuristic fallback: for each cue in language1, find overlapping cues in language2 (prefers overlaps >= 2s, merges multiple segments)

### What v4 does that we DON'T need

- Embedded caption viewer UI (we have our own viewer in the web app)
- Video playback control (seek, play/pause, loop)
- Per-video storage/persistence
- Typing practice feature
- Content script that monitors YouTube navigation

### v4 gotchas / fragility

- **iOS client spoofing** — hardcoded client version (`20.10.4`) and signature timestamp (`20073`). YouTube may rotate these.
- **Visitor data extraction** — regex parsing of `ytcfg.set(...)` from HTML. Could break if YouTube changes page structure.
- **No error handling for API changes** — if YouTube blocks the iOS client trick, the whole thing breaks silently.

## Design for v5 Extension

### Key Principle: Shared Code, Extension as Thin Shell

The extension lives inside the ytsub-v5 repo (monorepo). Core logic — subtitle extraction, json3 parsing, alignment — is written as **standalone modules** reusable by both the extension and the web app. The extension itself is a thin shell: inject the extraction script, add a UI button, POST the result.

This also means the core logic (everything except the extension chrome) can share the same UI framework/components as the web app, enabling future reuse (e.g., embedding a caption preview in the extension).

### Scope

Minimal extension — just a "send to ytsub" button on YouTube pages. All it does:

1. Extract video metadata + subtitle tracks from the current YouTube page
2. Parse and align subtitles (client-side, using shared modules)
3. POST the result to the ytsub app API (same `importVideo` format as today)

No embedded UI, no playback controls, no viewer. The web app handles everything after import.

### Architecture

```
Shared modules (used by extension + app + tests)
  ├── YouTube extraction script
  │     └── Reads ytInitialPlayerResponse from page context
  │         → Returns video metadata + caption track URLs
  ├── json3 parser → cue arrays
  └── Alignment module → text1/text2 paired rows

Extension (thin shell)
  ├── Content script (injects extraction script into main world, shows import button)
  │     └── On click: extract → parse → align → POST to ytsub app
  └── Popup (settings: app URL, auth token)

Testing (no extension needed)
  └── Playwright navigates to YouTube → page.evaluate(extraction script)
      → Validates extraction, parsing, alignment against real pages
```

### Subtitle Fetching Strategy

**Approach A: Page data extraction via `ytInitialPlayerResponse`** (tried first, partially blocked)

The YouTube watch page embeds caption track metadata in `ytInitialPlayerResponse` (a JS variable in the page). Reading metadata works, but **fetching subtitle content is blocked**.

- `ytInitialPlayerResponse` is accessible from main world — video metadata + caption track list extraction works (tested via Playwright `page.evaluate()`)
- Each track has a `baseUrl` for the `timedtext` API
- **Problem:** The `timedtext` API now requires a `pot` (Proof of Origin Token) parameter. YouTube's player JS generates this token at runtime (likely via botguard/challenge). The `baseUrl` from `ytInitialPlayerResponse` lacks `pot`, so fetching returns 200 with empty body — even in headed mode, even in incognito. The real browser's player adds `&potc=1&pot=<token>` to every timedtext request.
- Other YouTube APIs (`get_transcript`) also exist but use gzip-compressed protobuf bodies — harder to replicate.

**Conclusion:** `ytInitialPlayerResponse` is useful for **metadata + track list** but not sufficient for **fetching subtitle content**.

**Approach B: `youtubei/v1/player` API with iOS client spoofing** (v4 approach, trying next)

- Call the internal player API with spoofed iOS client headers
- Requires extracting `visitorData` from the page first
- Response includes caption track `baseUrl`s — these may work without `pot` since they're from the iOS client context
- More fragile (hardcoded client versions) but proven to work in v4

**Approach C: Network interception** (not yet tried)

- Let YouTube's own player fetch subtitles (it generates the POT)
- Intercept the timedtext responses via `page.route()` / service worker / fetch monkey-patching
- Works for both Playwright tests and extension context
- Requires triggering subtitle loading (e.g., CC button click)

**Result:** Approach B works — iOS client `baseUrl`s bypass POT. This is the current working approach.

### Track Selection Logic

The extension needs to pick which two subtitle tracks to fetch. Logic:

1. List available tracks, noting `kind` ("asr" = auto-generated, absent = manual)
2. Pick ko track: prefer manual (`kind` absent), fall back to auto (`kind: "asr"`)
3. Pick en track: prefer manual, fall back to auto-translated (YouTube provides translated tracks via `translationLanguage` param on the baseUrl)
4. If scenario C (ko manual, no en manual): fetch auto-translated en from ko

Show a brief UI (popup or injected element) letting user confirm/override track selection before importing.

### Alignment

v3 and v4 already have a proven alignment algorithm (`mergeCaptionEntryPairs` in `src/utils/youtube.ts`). Two-tier approach:

1. **Simple path:** exact timestamp grouping → 1:1 pairs
2. **Heuristic fallback:** overlap-based matching (≥ 2s overlap → concatenate, otherwise pick best overlap)

Port this directly. It already handles count mismatches and timing drift for real YouTube subtitles.

Output: `{ idx, begin, end, text1, text2 }[]` — same format as current import.

The alignment code should be a standalone module, testable outside the extension context. See `2026-03-08-ai-less-workflow.md` for further improvement ideas (DTW, bidirectional overlap) if the v3/v4 algorithm proves insufficient.

### Import Payload

Same format as the existing `importVideo` endpoint:

```ts
{
  video: {
    youtubeId: string,
    title: string,
    channelName: string,
    channelId: string,
    duration: number,
    language1: "ko",
    language2: "en",
  },
  captions: {
    idx: number,
    begin: number,
    end: number,
    text1: string,
    text2: string,
  }[],
  bookmarks: [],  // empty — manual bookmarking in the app
}
```

No new API endpoint needed. The existing import flow works as-is.

### Tech Stack

- **Manual extension** — no WXT or framework. Raw `manifest.json` + content script. The extension is thin enough that a framework adds more complexity than it removes.
- **Manifest V3** — required for Chrome Web Store
- **Plain JS** — content script is a single bundled file. Shared logic from `src/lib/youtube.ts` is bundled in at build time.

### Permissions

- `activeTab` — access current tab's YouTube page
- `storage` — persist app URL and auth token
- Host permission for ytsub app URL (to POST import data)

### Auth

The ytsub app has single-user auth. The extension needs the auth token to POST imports. Options:

- Store token in extension storage (configured once in popup)
- Or: extension opens a tab to the ytsub app, user logs in, extension reads the cookie/token

## Implementation Plan

### Step 1: Extraction script + Playwright tests

- Write a standalone extraction script that runs in a YouTube page context:
  - Read `ytInitialPlayerResponse` → video metadata + caption track list
  - Fetch json3 for a given track URL → parse to cue array
- Test via Playwright: navigate to YouTube video, `page.evaluate(script)`, assert output
- No extension involved — validates the approach with fast iteration
- **Goal:** Confirm `ytInitialPlayerResponse` is accessible and json3 fetching works

### Step 2: Extension shell + import button

- Manual extension under `extension/` — raw `manifest.json` + content script, no WXT
- Content script: inject extraction script into main world, show "Import to ytsub" button
- On click: extract → parse → align → POST to app API
- Popup: configure app URL + auth token
- **Note:** YouTube is an SPA — need to detect navigation between videos to show/hide the button. v4's `content/main.ts` handles this (reference for follow-up).

### Step 3: Track selection UI

- Show available subtitle tracks with manual/auto labels
- Let user pick ko + en tracks (with sensible defaults)
- Remember selections per channel or globally

### Step 4: Alignment module

- Start with simplest approach (overlap-based, see `2026-03-08-ai-less-workflow.md` for options)
- v3/v4's algorithm is mediocre — consider DTW or bidirectional overlap
- Unit-testable with fixture data (no browser needed)
- Test against ytsub-eval videos (compare with agent-produced alignments)
- Can iterate independently once extension is working

## Reference Files

- `~/code/personal/ytsub-v4/src/utils/youtube.ts` — v4's YouTube API client (subtitle fetching, metadata, alignment)
- `docs/skills/ytsub/SKILL.md` — current agent skill (shows scenarios A/B/C/D)
- `docs/skills/ytsub/scripts/parse-json3.ts` — current json3 parser
- `docs/skills/ytsub/scripts/check-alignment.ts` — current strict alignment
- `docs/tasks/2026-03-08-ai-less-workflow.md` — parent task

## Decisions

- **Monorepo** — extension lives in `extension/` within the ytsub-v5 repo. No WXT — raw manifest + content script. The extension is thin enough that a framework adds unnecessary complexity.
- **Core logic is standalone** — extraction script, json3 parser, alignment are independent of extension APIs. Testable via Playwright `page.evaluate()` against real YouTube pages.
- **fetchPlayerApi is the primary path** — `ytInitialPlayerResponse` is useful for quick subtitle availability checks (no API call), but its `baseUrl`s are blocked by POT. `fetchPlayerApi` (mobile client spoofing) returns usable `baseUrl`s.
- **Alignment last** — get the extension working end-to-end first with a simple alignment, then iterate on algorithm quality.

## Open Questions

- Does YouTube's auto-translate feature (fetching en translation of ko subs) work via the `baseUrl` params, or does it require the internal API?
- Should the extension support Firefox, or Chrome-only for now?

## Progress Log

### Step 1: Extraction script + Playwright tests

**Files created:**

- `src/lib/youtube.ts` — extraction module (`extractVideoData`, `fetchTrackJson3`, `parseJson3`, `pickTracks`)
- `e2e/youtube-extraction.spec.ts` — Playwright tests against real YouTube pages
- `playwright.youtube.config.ts` — separate config (no dev server needed)
- `package.json` — added `test-youtube` script

**Results:**

- `extractVideoData()` via `page.evaluate()` — **works**. Reads `ytInitialPlayerResponse`, returns video metadata + caption track list with correct fields.
- `pickTracks()` — **works**. Finds ko + en tracks from the extraction result.
- `fetchTrackJson3()` — **blocked**. The `timedtext` API returns 200 with empty body. YouTube now requires a `pot` (Proof of Origin Token) param generated by the player's JS at runtime. Confirmed in headed mode and with curl — not a headless detection issue, but a missing anti-bot token. Real browser (both logged-in and incognito) always includes `&potc=1&pot=<token>`.

**Approach B result:** iOS client player API works. The `baseUrl`s from the iOS client response don't require POT — json3 fetching succeeds. All 5 Playwright tests pass:

1. `extractVideoData` from `ytInitialPlayerResponse` — metadata + track list (**works**)
2. `pickTracks` — finds ko + en tracks (**works**)
3. `fetchPlayerApi` with iOS client — returns metadata + tracks (**works**)
4. `fetchTrackJson3` with player API `baseUrl` — returns json3, parses to 62 ko cues (**works**)
5. Fetch both ko + en tracks — 62 ko cues, 56 en cues (**works**)

**Working extraction pipeline:** `page.evaluate(fetchPlayerApi, videoId)` → `pickTracks` → `page.evaluate(fetchTrackJson3, baseUrl)` → `parseJson3`

**Note on extractVideoData:** `ytInitialPlayerResponse` works for metadata + checking subtitle availability (no API call needed), but its `baseUrl`s are blocked by POT. `fetchPlayerApi` is the only usable path for actually fetching subtitles.

## Status

- **Phase:** Step 1 complete, Step 2 POC done (extraction + JSON download works)
- **Superseded by:** `2026-03-08-caption-viewer.md` — pivoted to extension-as-viewer with shared standalone app. This doc remains as reference for extraction findings (approach A/B/C, POT discovery).
