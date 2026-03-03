# ytsub — Product Requirements

## Overview

A single-user web app for language learning via YouTube subtitles. Watch videos with dual subtitle panel, bookmark notable words/phrases, and curate vocabulary.

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- LLM-powered vocab extraction (korean-vocab skill) works well but outputs plain text — no connection back to the video
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction

## Core concept

A web app that stores YouTube videos with their subtitles, provides a viewer with dual caption panel, and supports bookmarking words/phrases with rich metadata. External clients (agent, CLI) push video+subtitle data via API since YouTube no longer allows server-side fetching.

## Architecture

```
Clients (yt-dlp + agent, CLI, etc.)
  POST /api/videos    →  video + captions
  POST /api/bookmarks →  vocab entries (manual or LLM-extracted)

Web UI (browser)
  Video viewer: YouTube embed + dual caption panel
  Bookmarking: select word/phrase → add translation, notes
  Browse: list videos, filter bookmarks
```

- Single-user, password auth
- App is a viewer/curator — doesn't know about yt-dlp, LLM, or Anki
- API is the boundary; any client can push data

### Why not an extension?

v4 went extension because content scripts can hit YouTube APIs from same origin (how Language Reactor works too). Trade-off: extension gives direct YouTube access but adds complexity (store review, Chrome API constraints, harder to build full UI). Web app + yt-dlp is cleaner architecturally. Can revisit if yt-dlp friction becomes a problem.

## Data model

Based on ytsub-v3, redesigned. Dropped: SRS (Anki handles it), multi-user, email/password-reset flows.

### v3 schema (reference)

```
videos          — videoId, title, author, channelId, language1_id, language2_id
captionEntries  — videoId (FK), index, begin, end, text1, text2
bookmarkEntries — videoId (FK), captionEntryId (FK), text, side, offset
decks           — (SRS)
practiceEntries — (SRS)
practiceActions — (SRS)
users           — (multi-user)
```

### Proposed schema

```
videos
  - id
  - youtube_id        (e.g. "dQw4w9WgXcQ")
  - title
  - channel_name
  - channel_id
  - duration          (seconds)
  - language1         (e.g. "ko")
  - language2         (e.g. "en")
  - created_at

captions
  - id
  - video_id (FK)
  - language          (e.g. "ko", "en")
  - index             (sequential order)
  - begin             (seconds, float)
  - end               (seconds, float)
  - text

bookmarks
  - id
  - video_id (FK)
  - caption_id (FK, nullable)
  - text              (word/phrase in target language)
  - side              (0 = language1, 1 = language2 — which column)
  - offset            (character offset within caption text — for inline highlighting)
  - translation       (meaning in known language)
  - context           (subtitle line where it appears)
  - timestamp         (begin time in video, seconds)
  - notes             (etymology, hanja, usage notes, etc.)
  - status            (pending | approved | rejected)
  - created_at
```

### Design changes from v3

**videos**: added `duration`. Simplified language fields. Dropped `userId`, cached counts.

**captions** (was `captionEntries`): one row per cue per language (v3 crammed both into `text1`/`text2`). Cleaner when languages have different timing/cue counts.

**bookmarks** (was `bookmarkEntries`): enriched with `translation`, `context`, `notes`, `status`. Timestamp directly on bookmark. Kept `side`/`offset` — needed for inline highlighting via `partitionRanges`. For agent-created bookmarks, `side`/`offset` can be computed by string-matching `text` against the caption. `caption_id` nullable since bookmark might not map to a single cue cleanly.

## Features & implementation order

### P0 — Core viewer (MVP)

1. **Import video + captions** — API endpoint to receive video metadata + subtitle cues
2. **Video list** — browse imported videos
3. **Video viewer** — port v3's viewer layout:
   - YouTube embed (left) + scrolling dual caption panel (right, 2-col: language1 | language2)
   - Auto-scroll with playback, click caption to seek
   - Virtualized subtitle list (TanStack Virtual or similar)
   - Current entry highlighted, repeat mode for looping sections
4. **Bulk bookmark API** — endpoint for agent to push extracted vocab in batch
5. **Bookmark navigation in viewer** — when bookmarks exist for a video, provide a way to skip through only the bookmarked captions (prev/next bookmark, or a filtered view showing only bookmarked entries)

### P1 — Curation & browse

6. **Bookmark status** — approve/reject flow for agent-pushed entries (inline in viewer)
7. **Bookmark list** — browse/search all bookmarks across videos
8. **Manual bookmarking** — v3's approach worth keeping: native text selection + data-attribute DOM walk (`data-index`, `data-side`, `data-offset`) to map selection back to caption/position. `partitionRanges` splits caption text into highlighted/non-highlighted spans. Minimal code, natural UX. Lower priority but the highlight rendering is reusable for showing agent-created bookmarks in captions too.

### P2 — Quality of life

9. **Bookmark export** — JSON export for Anki pipeline consumption
10. **Search** — full-text search across captions and bookmarks
11. **Keyboard shortcuts** — efficient curation without mouse

### P1.5 — Skill authoring

- [ ] Author agent skill for clawdbot (the main way data enters the app)
- [ ] Skill handles: yt-dlp fetch, LLM caption correction, translation, vocab extraction, POST to app
- [ ] See `notes/skill-integration.md` for details

Key LLM capabilities:

- Correct bad Korean auto-captions from context
- Generate English translation from Korean-only subs (single track is enough)
- Cross-reference with manual subs in other languages when available

### Future / maybe

- Typing practice (v3/v4 had this)
- Extension as data source (content script fetches subs from YouTube same-origin, POSTs to app API — replaces yt-dlp step)
- Mobile-friendly layout

## Tech stack

### Frontend

- **React 19 + TypeScript** — same as toy-midi / anki-tools
- **Vite 7** — build & dev
- **Tailwind CSS 4** — styling
- **Radix UI + shadcn** — components (lucide icons, cva, clsx, tailwind-merge)
- **@tanstack/react-query** — data fetching
- **oxfmt** — lint/format
- **Playwright** — E2E tests
- **pnpm** — package manager

### Backend / API

- **oRPC** — type-safe RPC (trpc-style), with OpenAPI adapter for REST-ish access by external clients (agent, CLI)
  - https://orpc.dev/docs/openapi/getting-started
- **@cloudflare/vite-plugin** — unified Vite + Workers dev experience

### Platform

- **Cloudflare Workers** — runtime
- **Cloudflare D1** — storage (SQLite)
- **Wrangler** — local dev + deploy

All-in on Cloudflare. D1 for local dev and production. Single platform.
