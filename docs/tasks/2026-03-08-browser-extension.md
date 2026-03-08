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

### Scope

Minimal extension — just a "send to ytsub" button on YouTube pages. All it does:

1. Extract video metadata + subtitle tracks from the current YouTube page
2. Parse and align subtitles (client-side)
3. POST the result to the ytsub app API (same `importVideo` format as today)

No embedded UI, no playback controls, no viewer. The web app handles everything after import.

### Architecture

```
YouTube page
  ├── Content script (detects video, shows import button)
  │     └── Reads ytInitialPlayerResponse or calls youtubei/v1/player
  │         → Gets caption track list
  │         → Fetches json3 for ko + en tracks
  │         → Parses + aligns → text1/text2 rows
  │         → POSTs import.json to ytsub app
  │
  └── Popup (optional, for settings)
        └── Configure ytsub app URL, auth token
```

### Subtitle Fetching Strategy

Two approaches, in order of preference:

**Option 1: Page data extraction (simplest)**

The YouTube watch page already contains caption track metadata in `ytInitialPlayerResponse`. A content script can read this directly from the page's JS context without any API calls.

- Extract `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks`
- Each track has a `baseUrl` — fetch with `&fmt=json3` (same-origin, no CORS issues)
- No client spoofing needed since we're on the YouTube page

**Option 2: youtubei/v1/player API (v4 approach, fallback)**

If page data extraction doesn't work reliably:

- Call the internal player API with spoofed iOS client headers
- Requires extracting `visitorData` from the page first
- More fragile (hardcoded client versions) but proven to work

**Preference:** Start with Option 1. It's simpler and less fragile since it reads data YouTube already loaded. Fall back to Option 2 if needed.

### Track Selection Logic

The extension needs to pick which two subtitle tracks to fetch. Logic:

1. List available tracks, noting `kind` ("asr" = auto-generated, absent = manual)
2. Pick ko track: prefer manual (`kind` absent), fall back to auto (`kind: "asr"`)
3. Pick en track: prefer manual, fall back to auto-translated (YouTube provides translated tracks via `translationLanguage` param on the baseUrl)
4. If scenario C (ko manual, no en manual): fetch auto-translated en from ko

Show a brief UI (popup or injected element) letting user confirm/override track selection before importing.

### Alignment

Port the alignment logic from the ai-less workflow doc. Start simple:

1. Try strict 1:1 matching (same cue count, timestamps within tolerance)
2. Fall back to overlap-based heuristic (v4's approach, adapted)
3. Output: `{ idx, begin, end, text1, text2 }[]` — same format as current import

The alignment code should be a standalone module, testable outside the extension context.

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

- **WXT** — same as v4, WebExtension framework (handles Manifest V3 boilerplate, HMR in dev)
- **Manifest V3** — required for Chrome Web Store
- **TypeScript** — shared types with ytsub-v5 app
- **Minimal UI** — no React needed if it's just a button + track selection dropdown. Could use vanilla DOM or a tiny framework.

### Permissions

- `activeTab` — access current tab's YouTube page
- `storage` — persist app URL and auth token
- Host permission for ytsub app URL (to POST import data)

### Auth

The ytsub app has single-user auth. The extension needs the auth token to POST imports. Options:

- Store token in extension storage (configured once in popup)
- Or: extension opens a tab to the ytsub app, user logs in, extension reads the cookie/token

## Implementation Plan

### Step 1: Subtitle extraction proof-of-concept

- Minimal content script on YouTube
- Extract `ytInitialPlayerResponse` from page
- Log available caption tracks to console
- Fetch one track as json3, parse to cue array
- **Goal:** Validate that page data extraction works reliably

### Step 2: Alignment module

- Port/adapt v4's alignment logic as a standalone module
- Test against ytsub-eval videos (compare with agent-produced alignments)
- Can develop and test independently of the extension

### Step 3: Import button + POST

- Inject a small "Import to ytsub" button on YouTube watch pages
- On click: fetch both tracks, align, POST to app API
- Show success/error feedback
- Handle auth (token in extension storage)

### Step 4: Track selection UI

- Show available subtitle tracks with manual/auto labels
- Let user pick ko + en tracks (with sensible defaults)
- Remember selections per channel or globally

## Reference Files

- `~/code/personal/ytsub-v4/src/utils/youtube.ts` — v4's YouTube API client (subtitle fetching, metadata, alignment)
- `~/code/personal/ytsub-v4/wxt.config.ts` — v4's manifest config
- `docs/skills/ytsub/SKILL.md` — current agent skill (shows scenarios A/B/C/D)
- `docs/skills/ytsub/scripts/parse-json3.ts` — current json3 parser
- `docs/skills/ytsub/scripts/check-alignment.ts` — current strict alignment
- `docs/tasks/2026-03-08-ai-less-workflow.md` — parent task

## Open Questions

- Should this live in the ytsub-v5 repo (monorepo) or a separate repo?
- Is `ytInitialPlayerResponse` reliably accessible from a content script, or does YouTube's CSP block it?
- Does YouTube's auto-translate feature (fetching en translation of ko subs) work via the `baseUrl` params, or does it require the internal API?
- Should the extension support Firefox, or Chrome-only for now?

## Status

- **Phase:** Planning / awaiting feedback
- **Next:** Proof-of-concept for subtitle extraction from YouTube page data
