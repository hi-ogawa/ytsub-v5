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
- **Sync button** automatically determines direction (push/pull) based on timestamps
- Expectation: user syncs before/after each session, one device at a time
- If states diverge (both sides changed), server wins (full overwrite)

No merge needed because the usage pattern is sequential: work on one device, sync, switch device, sync. Same as Anki — the discipline is "always sync."

### Sync state model (per video)

Three timestamps, two sources:

**Client-side** (in `zamak:video-index` localStorage, per entry):

- **`syncedAt`** — the sync checkpoint. Set to `now` after any successful sync (push or pull). Represents the last moment client and server were known to agree. New field.
- **`localUpdatedAt`** — bumped on every local bookmark change. Already exists as `updatedAt` in `VideoIndexEntry`.

**Server-side** (queried on demand via lightweight endpoint, e.g. `GET /api/videos/lastUpdated?youtubeId=xxx`):

- **`serverUpdatedAt`** — when the server's data for this video was last modified

`syncedAt` is the reference point. The other two are compared against it:

| local changed?<br>`localUpdatedAt > syncedAt` | server changed?<br>`serverUpdatedAt > syncedAt` | State                                                      | Sync action                                                               |
| :-------------------------------------------: | :---------------------------------------------: | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
|                      no                       |                       no                        | **Synced** — nothing to do                                 | Button: "synced" (disabled/green)                                         |
|                      yes                      |                       no                        | **Local ahead** — local has unpushed changes               | Button: "push" → upload to server                                         |
|                      no                       |                       yes                       | **Server ahead** — server has changes client hasn't pulled | Button: "pull" → download from server                                     |
|                      yes                      |                       yes                       | **Conflict** — both sides changed since last sync          | Button: "sync" → prompt user: "keep local" (push) or "keep server" (pull) |

Notes:

- After any successful sync (push or pull), set `syncedAt = now`. This is the checkpoint — everything before it is "agreed upon."
- Conflict case should be rare (means user edited on two devices without syncing). User chooses which side wins — same as Anki's conflict prompt.
- `serverUpdatedAt` is fetched on page load (or on sync button hover/click) — cheap, just a timestamp query.
- For a video that has never been synced, `syncedAt` is null → treat as "local ahead" (push).

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

## Resolved questions

1. **Auth story** — Login form in extension (popup or settings). Username/password, same endpoints as web app. Session token stored in `chrome.storage.local`, sent as `Authorization` header. No cookies — avoids cross-origin/CORS/CSP complexity. In real extension, content script messages background worker to make API calls (extension origin, not subject to YouTube's CSP). In dev-viewer, direct fetch works (same origin).

2. **Sync UI** — Sync button in caption panel header (near settings dropdown). Natural location — you're looking at a video, you sync it.

3. **Sync granularity** — Per-video to start. Simpler, maps to workflow (finish video → sync). Global sync can come later.

4. **What gets synced** — Full session (video + captions + bookmarks) as a unit. Reuses `importVideo` endpoint directly. Captions are small and re-fetching from YouTube is unreliable.

5. **Extension-only fallback** — Sync button hidden when not logged in. Everything else unchanged (IndexedDB-only). No behavior change for users without accounts.

6. **Data layer abstraction** — Defer to Phase 3. Phase 1 uses direct API calls for sync.

## Dev-viewer strategy for Phase 1

The dev-viewer already mirrors the extension environment: same `useCaptionSession` hook, same `CaptionPanel` component, fixture data instead of live YouTube. Phase 1 sync features follow the same pattern — build them as shared code, test via dev-viewer, later wire into the real extension.

### What's different between dev-viewer and real extension

| Concern           | Dev-viewer (web app)                                | Real extension                                                    |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| **Auth**          | Same-origin cookie auth (already works — app login) | Background worker holds token, `Authorization` header             |
| **API calls**     | Direct `fetch("/api/...")` (same origin)            | Content script → message → background worker → `fetch(serverUrl)` |
| **Token storage** | Cookie (handled by browser)                         | `chrome.storage.local`                                            |
| **Persistence**   | IndexedDB (same as extension)                       | IndexedDB (same)                                                  |

Key insight: **in the dev-viewer, the user is already authenticated with the web app**. So the sync button can call server APIs directly — no separate login flow needed. The extension-specific login UI (username/password form in popup) is only needed for the real extension, where there's no existing session.

### Dev-viewer Phase 1 scope

1. **Sync button in `CaptionPanel`** — new icon button in the header toolbar (near settings dropdown)
   - Visible when an `onSync` callback is provided (dev-viewer provides it, extension provides it when logged in, web app video-viewer doesn't — it's already server-backed)
   - Calls `onSync(session)` with the current `CaptionSession` data

2. **`onSync` implementation in dev-viewer** — direct `fetch` to `importVideo` endpoint
   - Dev-viewer already runs on the same origin as the server
   - User is already logged in (web app auth cookie)
   - Builds the export payload (same shape as `handleExport()`) and POSTs it
   - Shows success/error feedback

3. **Sync state indicator** — visual badge on the sync button
   - "unsynced" (default) → "syncing..." (during request) → "synced" (after success)
   - Resets to "unsynced" when bookmarks change after last sync

4. **E2E test** — dev-viewer test that creates bookmarks, clicks sync, verifies data appears in server DB (via video-viewer or API)

### What's deferred to real extension wiring

- Login form UI (extension popup / settings page)
- Background worker message passing (`chrome.runtime.sendMessage`)
- Token storage in `chrome.storage.local`
- Server URL configuration
- CORS headers on server (if needed for extension origin)

These are plumbing concerns — the sync logic itself (payload building, API call, state management) is the same code, just called differently.

## Implementation plan

### Phase 1: Extension auth + per-video push sync

Prerequisite: user auth system ✅ (done — see `2026-03-10-user-auth.md`)

**Step 1: Sync button + push logic (dev-viewer first)**

- Add sync button to `CaptionPanel` header (via `onSync` prop)
- Implement `onSync` in dev-viewer: build export payload → `POST /api/importVideo`
- Sync state indicator (unsynced → syncing → synced)
- E2E test: bookmark in dev-viewer → sync → verify in server DB

**Step 2: Extension login UI**

- Login form in extension popup (username/password)
- Background worker: `login()` → store token in `chrome.storage.local`
- Auth state check on extension load

**Step 3: Extension sync wiring**

- Content script sends sync message to background worker
- Background worker calls `importVideo` with stored auth token
- Same payload shape, same state management

### Phase 2: Server → extension pull

- New server endpoint: get full video session (video + captions + bookmarks) by `youtubeId`
- Sync button does push then pull (server wins)
- Pull overwrites local IndexedDB session

### Phase 3: Data layer abstraction

- Shared interface: `{ getCaptions, getBookmarks, createBookmark, updateBookmark, ... }`
- Two implementations: `ServerDataLayer` (API calls) and `LocalDataLayer` (IndexedDB)
- Extension uses `ServerDataLayer` when connected, falls back to `LocalDataLayer`
- Enables UI consolidation (single caption panel component for all contexts)

## Status

- [x] High-level design discussion
- [x] Resolve open questions
- [ ] Approve implementation plan
- [ ] Phase 1: Extension auth + per-video push sync
- [ ] Phase 2: Server → extension pull
- [ ] Phase 3: Data layer abstraction
