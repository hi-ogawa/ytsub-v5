# Sync caption sessions (not just bookmarks)

## Problem

Currently sync is bookmark-gated: a video only enters the video index (and becomes visible to sync) when it has >= 1 bookmark. Videos with 0 bookmarks are removed from the index (`syncVideoIndex()` calls `removeFromVideoIndex`). This means:

- Opening a fresh video and loading captions does **not** create a syncable entry
- The sync indicator shows "unknown" (nothing to sync) even though a full caption session exists locally
- Caption data never reaches the server until the user creates their first bookmark
- Deleting all bookmarks implicitly removes the session from the index (reactive deletion)

This matters because **the extension is the only way data enters the system** — the server cannot scrape YouTube. If a user opens a video on the extension, the captions are fetched from YouTube and stored in IndexedDB, but they're invisible to sync until bookmarked. The web app on another device can't access those captions.

## Approach: action-based session lifecycle

Replace the current reactive model (session visibility driven by bookmark count) with explicit user actions:

### Current (reactive)

```
open video → captions in IndexedDB (invisible to sync/index)
add bookmark → appears in video index, syncable
delete last bookmark → removed from video index (implicit deletion)
```

### Proposed (action-based)

```
(no session) --[create bookmark]--> (session in index, syncable)
(no session) --[manual sync/pull]--> (session in index, syncable)
(session exists) --[delete all bookmarks]--> (session stays, 0 bookmarks, still syncable)
(session exists) --[explicit delete action]--> (no session)
```

Key differences:

1. **Session enters the index** on first bookmark or manual sync — not on video open (avoids indexing every casually opened video)
2. **Session persists** when bookmarks reach 0 — clearing bookmarks is not the same as deleting the session
3. **Session deletion is explicit** — a separate user action (e.g. delete button on bookmarks page), not a side effect of bookmark count

This naturally solves the sync problem: once a session exists in the index, it stays syncable regardless of bookmark count. Caption data reaches the server on first sync and remains available.

## Key files

- `src/lib/caption-session.ts` — `syncVideoIndex()` (line ~322) gates on `bookmarks.length > 0`, calls `removeFromVideoIndex` when 0
- `src/lib/video-index.ts` — `updateVideoIndex`, `removeFromVideoIndex`
- `src/lib/sync.ts` — `computeSyncState`, `useSyncState`, `mergeVideoEntries`
- `src/lib/dev-fixtures.ts` — `bootstrapFixtures` calls `updateVideoIndex` with bookmarkCount=0

## Implementation sketch

1. **Remove reactive deletion**: `syncVideoIndex()` should always call `updateVideoIndex`, never `removeFromVideoIndex` based on bookmark count
2. **Keep explicit delete**: `removeFromVideoIndex` stays, but only called from user-initiated delete actions (bookmarks page delete button, which already exists)
3. **Also delete from IndexedDB**: explicit delete should clean up both video index and IndexedDB session
4. **Bookmarks page**: already shows videos from the index — now it will include 0-bookmark videos. May want UI indication (dimmed card, "no bookmarks yet" label) but no filtering needed

## Open questions

1. **First-open behavior**: When a user opens a video for the first time (captions load), should it immediately enter the index? Or only on first bookmark / explicit save? Entering on open would index every casually browsed video. Entering on first bookmark keeps the current "intent signal" but delays sync availability.

2. **Server-side delete cascade**: When a user explicitly deletes a session locally, should it also delete from the server on next sync? Or should server data persist independently?

3. **Extension vs web app**: The web app pulls sessions from the server. If a session is deleted locally on the web app, should it also delete from server? The extension is the data source — the web app is a view.
