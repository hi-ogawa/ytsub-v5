# ytsub — Background

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- LLM-powered vocab extraction (korean-vocab skill) works well but outputs plain text — no connection back to the video
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction

## Core concept

A web app that stores YouTube videos with their subtitles, provides a viewer with dual caption panel, and supports bookmarking words/phrases with rich metadata. External clients (agent, CLI) push video+subtitle data via API since YouTube no longer allows server-side fetching.

```
Clients (yt-dlp + agent, CLI, etc.)
  API  →  push video metadata, caption cues, vocab entries

Web UI (browser)
  Video viewer: YouTube embed + dual caption panel
  Bookmarking: select word/phrase → add translation, notes
  Browse: list videos, filter bookmarks
```

- Single-user app
- App is a viewer/curator — doesn't know about yt-dlp, LLM, or Anki
- API is the boundary; any client can push data

## Why not an extension?

v4 went extension because content scripts can hit YouTube APIs from same origin (how Language Reactor works too). Trade-off: extension gives direct YouTube access but adds complexity (store review, Chrome API constraints, harder to build full UI). Web app + yt-dlp is cleaner architecturally.

## Data model

See `src/server/schema.ts` for the schema. Key design decisions vs v3:

- **captions**: one row per cue with `text1`/`text2` (same as v3). Alignment/merging happens at import time, not display time.
- **bookmarks**: enriched with `translation`, `context`, `notes`, `status`. Kept `side`/`offset` for inline highlighting via `partitionRanges`. `caption_id` nullable since bookmark might not map to a single cue cleanly.
