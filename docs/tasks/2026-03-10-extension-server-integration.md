# Extension ↔ Server Integration

## Problem

Extension data lives in IndexedDB (local, per-machine). Web app data lives in server DB (durable, accessible anywhere). Today they're completely disconnected — the only bridge is manual export/import of JSON files (3-4 steps).

This makes the extension a dead-end for data: bookmarks don't survive machine switches, and getting data into the web app (for mobile review, Anki export, etc.) is tedious.

## Design decisions from discussion

### Extension as API client, not standalone app

The extension should be a client of the server, same as the web app viewer. IndexedDB is working memory / cache, not a permanent store. Server is source of truth.

Exception: extension-only users (no account) can continue using IndexedDB-only mode.

### Anki-style explicit sync

Model after Anki: local-first with explicit sync button. No background sync, no merge logic.

- Extension works against IndexedDB (fast, no network needed)
- **Sync button** pushes local → server, then pulls server → local
- Expectation: user syncs before/after each session, one device at a time
- If states diverge (forgot to sync), server wins (full overwrite)
- **Sync state indicator**: shows whether local matches server ("synced" / "unsynced changes")

No merge needed because the usage pattern is sequential: work on one device, sync, switch device, sync. Same as Anki — the discipline is "always sync."

### Web app viewer role

- On desktop: extension viewer and web app viewer are effectively equivalent (same UI, same data once connected). Extension is primary since you're already on YouTube.
- On mobile: web app viewer is the only option. This is its main edge — review vocab on the go.
- Long-term: desktop web app viewer may become redundant.

## Current state (what exists)

### Extension side
- **IndexedDB** (`zamak` db, `caption-sessions` store): stores `CaptionSession` per `youtubeId` with merged captions + bookmarks
- **Export**: `handleExport()` in `caption-session.ts` builds JSON payload and triggers file download
- **`window.__zamak` API**: full read/write surface for AI extensions
- **Bookmarks page**: lists videos with bookmarks via `chrome.storage.local`

### Server side
- **`importVideo` endpoint** (`server/routes/videos.ts`): idempotent upsert — takes `{video, captions, bookmarks}`, upserts video, replaces captions, inserts bookmarks. Already handles the exact payload the extension exports.
- **Full CRUD**: `getVideo`, `listVideos`, `listBookmarks`, `createBookmarks`, `updateBookmark`, `deleteBookmark`
- **Auth**: single-user, token-based

### Bridge (current)
Extension "Export import.json" → file download → web app "Import" dialog → upload → `importVideo` API call

## Open questions

1. **Auth story** — how does extension authenticate with the server? Options:
   - Paste API token into extension settings (simplest)
   - OAuth / cookie-based (more complex, smoother UX)
   - Extension popup with login form

2. **Sync UI** — where does the sync button live? Caption panel header? Extension popup? Bookmarks page? All of the above?

3. **Sync granularity** — per-video (sync current video) or global (sync all videos at once)? Anki syncs everything; per-video is simpler to start.

4. **What gets synced** — full session (video + captions + bookmarks) as a unit? Or bookmarks only (captions can be re-fetched from YouTube)?

5. **Extension-only fallback** — how does the UI change when no server is configured? Same as today (IndexedDB-only), sync button hidden/disabled?

6. **Data layer abstraction** — shared interface for both server-backed and IndexedDB-only modes? This also enables the UI consolidation tracked in PRD.

## Implementation sketch (not yet approved)

### Phase 1: Auth + extension → server push
- **Prerequisite: user auth system** (see `2026-03-10-user-auth.md`) — user accounts, per-user data scoping, session management
- Extension settings: configure server URL, login with credentials
- Sync button in caption panel (or dropdown) — pushes current video session to server
- Reuse existing `importVideo` endpoint (already idempotent upsert)
- API call via background worker (avoids CORS from youtube.com)
- Sync state indicator (synced / unsynced)

### Phase 2: Server → extension pull
- New server endpoint: get video + captions + bookmarks by `youtubeId`
- Sync button also pulls server state into IndexedDB
- Full round-trip: push local, then pull server state (server wins)

### Phase 3: Data layer abstraction
- Shared interface: `{ getCaptions, getBookmarks, createBookmark, updateBookmark, ... }`
- Two implementations: `ServerDataLayer` (API calls) and `LocalDataLayer` (IndexedDB)
- Extension uses `ServerDataLayer` when connected, falls back to `LocalDataLayer`
- Enables UI consolidation (single caption panel component for all contexts)

## Status

- [x] High-level design discussion
- [ ] Resolve open questions
- [ ] Approve implementation plan
- [ ] Implementation
