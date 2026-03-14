# ytsub (Zamak) — Architecture

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- LLM-powered vocab extraction (korean-vocab skill) works well but outputs plain text — no connection back to the video
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction

## Core concept

A local-first language learning tool built around YouTube subtitles. Users watch videos with a dual caption panel, bookmark words/phrases, and curate vocabulary. Data lives in the browser (IndexedDB) and optionally syncs to a server for cross-device access.

```
Browser extension (YouTube page)
  └── Fetches subtitles, renders caption panel, creates bookmarks
      └── Stores locally in IndexedDB
          └── Optionally syncs to server (push/pull)

Web app (browser)
  └── Same caption panel UI, reads from IndexedDB
      └── Import: load export.json into IndexedDB (manual transfer without login)
      └── Sync: push/pull with server when logged in
```

## Architecture: local-first, server-optional

Both the browser extension and the web app are **equivalent local clients**. They use the same components (`CaptionPanel`, `CaptionList`) and the same local storage (`CaptionSessionManager` → IndexedDB + `videoIndexStore` → localStorage).

### Data flow

- **Extension** (primary): fetches subtitles from YouTube same-origin → `CaptionSessionManager` → IndexedDB. User creates bookmarks. Optionally syncs to server.
- **Web app**: reads from IndexedDB. Data gets there via:
  - Import (upload `export.json` from extension → IndexedDB, no login required)
  - Sync pull (fetch from server → IndexedDB, requires login)
- **Server**: a sync target, not the primary data source. Stores videos, captions, bookmarks in D1 (SQLite). Used for cross-device access and backup.

### Why local-first

- The extension is the only way to fetch YouTube subtitle data (same-origin requirement)
- The web app cannot call YouTube APIs — it can only display data that originated from the extension
- Making both clients local-first means zero divergent code paths in the UI
- The web app works without login — login only needed for server sync

### Shared components

Both extension and web app render the same UI components:

| Component               | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `CaptionPanel`          | Full panel: track picker (extension only), settings, tabs |
| `CaptionList`           | Caption rows with bookmark highlights, auto-scroll        |
| `BookmarksPage`         | Video list with sync badges                               |
| `CaptionSessionManager` | In-memory store backed by IndexedDB                       |

The extension uses `CaptionPanel` with track picker (fetches captions from YouTube). The web app uses `CaptionPanel` with `sessionOnly` flag (loads existing session from IndexedDB, no caption fetching).

### Web app without login

The web app works without authentication:

- Import `export.json` → IndexedDB → view/bookmark locally
- No sync badges, no server interaction

With login:

- Same local functionality + server sync
- Merged local+server video list with sync badges (push/pull per video)
- Header menu shows "Log out" instead of "Log in"

## Browser extension as data source

See [architecture-extension.md](./architecture-extension.md) for how the extension fetches subtitles from YouTube (same-origin + iOS client spoofing to bypass CORS and POT).

## Dev-viewer for testing

The dev-viewer (`/dev/:videoId`) provides the same caption panel experience using local fixture data, so UI iteration happens via `pnpm dev` without loading the extension. It uses the exact same shared components as both the extension and the web app.

## Agent skill as data pipeline (legacy)

The original import pipeline: a local AI agent (ytsub skill) runs yt-dlp, parses subtitles, aligns bilingual captions, and extracts vocabulary. Still works but is slow (~3-7 min per video). Being replaced by the browser extension for subtitle fetching and manual bookmarking.

## Data model

### Client storage (IndexedDB)

- `PersistedCaptionSession`: video metadata + merged captions + bookmarks, keyed by `youtubeId`
- `videoIndexStore` (localStorage): lightweight index of all videos with bookmark counts, for the video list page

### Server storage (D1 SQLite)

See `src/server/schema.ts`. Used for sync/backup:

- **videos**: metadata (youtubeId, title, channel, language pair, vssIds)
- **captions**: one row per merged cue with `text1`/`text2`
- **bookmarks**: enriched with `translation`, `context`, `notes`, `status`. `caption_id` nullable.

### Export format (`export.json`)

The interchange format between extension export and web app import. Contains `video` (metadata), `captions` (merged cues), and `bookmarks` (with captionIdx references). Same format used by server `importVideo` API and client `importExportData()`.
