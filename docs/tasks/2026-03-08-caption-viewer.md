# Caption Viewer — Extension + Standalone App

## Problem

ytsub-v5 needs a bilingual caption viewer for YouTube videos. The current pipeline (yt-dlp + AI agent) is slow and fragile. The extraction POC (`src/lib/youtube.ts`) proves we can fetch subtitles client-side via YouTube's internal API.

## Key Insight

The viewer should work in **two contexts** with shared code:

1. **Chrome extension** — embedded on YouTube pages, the primary user experience
2. **Standalone app** — same viewer UI, for development iteration and testing

Both share: extraction logic, json3 parsing, alignment, viewer components.

## Architecture

```
src/lib/youtube.ts          — extraction, parsing, alignment (shared)
src/components/viewer/      — caption viewer UI (shared, React)

Extension (src/extension/)
  └── content script: injects viewer into YouTube page
      └── fetches subtitles via fetchPlayerApi (same-origin, in page context)

Standalone app (src/)
  └── dev page: paste video ID → see viewer
      └── fetches subtitles via local dev endpoint
          └── headless Playwright → page.evaluate(fetchPlayerApi)
```

### fetchPlayerApi abstraction

`fetchPlayerApi` must run in a YouTube page context (needs same-origin + `visitorData` from `ytcfg`). Two implementations of the same interface:

- **Extension**: direct call in YouTube's main world (content script)
- **Dev app**: local server endpoint that uses headless Playwright to navigate to YouTube and `page.evaluate(fetchPlayerApi, videoId)`

The consumer just gets back `YouTubeExtractionResult` either way.

### What's client-only

- Subtitle fetching, parsing, alignment
- Viewer UI (bilingual caption display, synced to video playback)
- Per-video caching (selected tracks, fetched cues)

### What's out of scope

- Server-side storage, accounts, auth
- POST to app API (can add later as optional export)
- Bookmarking (existing app feature, not needed in extension for now)

## Implementation Plan

### Step 1: Extraction + tests (DONE)

- `src/lib/youtube.ts` — `fetchPlayerApi`, `fetchTrackJson3`, `parseJson3`, `pickTracks`
- `e2e/youtube-extraction.spec.ts` — Playwright tests against real YouTube
- Extension POC with JSON download — proves end-to-end extraction works

### Step 2: Dev server endpoint for fetchPlayerApi

- Local-only API endpoint: `GET /api/dev/youtube/:videoId`
- Uses headless Playwright to navigate to YouTube, runs `page.evaluate(fetchPlayerApi)`, returns result
- Enables standalone app to fetch subtitles without extension context
- Keeps a browser instance alive for fast subsequent requests

### Step 3: Caption viewer component

- Shared React component in `src/components/viewer/`
- Takes aligned caption data as props — no fetching logic inside
- Bilingual display (text1/text2 rows), current-cue highlight synced to playback time
- Develop + iterate in standalone app with HMR

### Step 4: Embed viewer in extension

- Content script injects React viewer into YouTube page
- Wires up to YouTube player for playback sync
- Caches fetched cues per video (in-memory or extension storage)

### Step 5: Alignment improvements

- Start with simple overlap-based alignment
- Iterate with better algorithms (see `2026-03-08-ai-less-workflow.md` for DTW, bidirectional overlap)
- Test against eval videos, compare with agent-produced alignments
- Caption editability (fix alignment errors manually)

## Reference

- `docs/tasks/2026-03-08-browser-extension.md` — original extension task (extraction POC, approach A/B/C findings)
- `docs/background/architecture-extension.md` — why extension (CORS + POT)
- `docs/tasks/2026-03-08-ai-less-workflow.md` — alignment algorithm options
- `~/code/personal/ytsub-v4/` — prior art for extension-embedded viewer

## Status

- **Phase:** Planning
- **Done:** Extraction pipeline + extension POC (Step 1)
- **Next:** Step 2 — dev server endpoint for fetchPlayerApi
