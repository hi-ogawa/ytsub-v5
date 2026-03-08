# ytsub — Background

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- LLM-powered vocab extraction (korean-vocab skill) works well but outputs plain text — no connection back to the video
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction

## Core concept

A web app that stores YouTube videos with their subtitles, provides a viewer with dual caption panel, and supports bookmarking words/phrases with rich metadata.

```
Data sources (push video metadata, caption cues, vocab entries via API)
  ├── Browser extension (on YouTube page) — primary
  └── Agent skill (yt-dlp + LLM) — legacy, still works

Web UI (browser)
  Video viewer: YouTube embed + dual caption panel
  Bookmarking: select word/phrase → add translation, notes
  Browse: list videos, filter bookmarks
```

- Single-user app
- App is a viewer/curator — doesn't know how data arrives
- API is the boundary; any client can push data

## Browser extension as data source

See [architecture-extension.md](./architecture-extension.md) for how the extension fetches subtitles from YouTube (same-origin + iOS client spoofing to bypass CORS and POT).

## Agent skill as data pipeline (legacy)

The original import pipeline: a local AI agent (ytsub skill) runs yt-dlp, parses subtitles, aligns bilingual captions by timestamp, and extracts curated vocabulary. See `docs/skills/ytsub/SKILL.md`.

Still works but is slow (~3-7 min per video) and fragile. Being replaced by the browser extension for subtitle fetching and manual bookmarking for vocab extraction.

For local development, the project reuses the skill's intermediate output (the merged JSON with video + captions + bookmarks) as seed data. `scripts/db-seed.ts` reads these JSON files and imports them directly into the local D1 database, bypassing the API.

## Data model

See `src/server/schema.ts` for the schema. Key design decisions vs v3:

- **captions**: one row per cue with `text1`/`text2` (same as v3). Alignment/merging happens at import time, not display time.
- **bookmarks**: enriched with `translation`, `context`, `notes`, `status`. Kept `side`/`offset` for inline highlighting via `partitionRanges`. `caption_id` nullable since bookmark might not map to a single cue cleanly.
