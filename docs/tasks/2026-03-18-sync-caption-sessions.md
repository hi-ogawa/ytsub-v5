# Sync caption sessions (not just bookmarks)

## Problem

Currently sync is bookmark-gated: a video only enters the video index (and becomes visible to sync) when it has >= 1 bookmark. Videos with 0 bookmarks are removed from the index (`syncVideoIndex()` calls `removeFromVideoIndex`). This means:

- Opening a fresh video and loading captions does **not** create a syncable entry
- The sync indicator shows "unknown" (nothing to sync) even though a full caption session exists locally
- Caption data never reaches the server until the user creates their first bookmark

This matters because **the extension is the only way data enters the system** — the server cannot scrape YouTube. If a user opens a video on the extension, the captions are fetched from YouTube and stored in IndexedDB, but they're invisible to sync until bookmarked. The web app on another device can't access those captions.

## Desired behavior

Opening a video and loading captions should be a syncable event. A fresh video with 0 bookmarks should show "push" (not "unknown"), and syncing it should upload the caption session to the server so it's available on other devices.

## Current data flow

1. Extension fetches captions from YouTube (same-origin)
2. `saveSession()` stores to IndexedDB (captions + bookmarks)
3. `syncVideoIndex()` updates localStorage video index — **but only if bookmarkCount > 0**, otherwise removes from index
4. Sync reads from video index to determine what exists locally
5. Push reads from IndexedDB to build export data

## Key files

- `src/lib/caption-session.ts` — `syncVideoIndex()` (line ~322) gates on `bookmarks.length > 0`
- `src/lib/video-index.ts` — `updateVideoIndex`, `removeFromVideoIndex`
- `src/lib/sync.ts` — `computeSyncState`, `useSyncState`, `mergeVideoEntries`
- `src/lib/dev-fixtures.ts` — `bootstrapFixtures` calls `updateVideoIndex` with bookmarkCount=0

## Open questions

1. **Should the video index always include videos with 0 bookmarks?** Removing the bookmark gate in `syncVideoIndex()` is the simplest change, but it means the bookmarks page would show videos with 0 bookmarks. Is that desired, or should the bookmarks page filter them out while sync still tracks them?

2. **Bookmarks page vs sync scope.** Currently the bookmarks page and sync share the same data source (video index). If we decouple them — sync tracks all sessions, bookmarks page only shows videos with bookmarks — we need either a separate "sync index" or a filter on the bookmarks page.

3. **Extension-only concern?** The web app can't fetch from YouTube, so this is primarily about the extension syncing caption sessions. The dev viewer uses fixtures (not YouTube), so the dev/fixture case is a testing proxy for the real extension flow. Should the web app even show a sync indicator for videos it didn't fetch?

4. **Storage cost.** Caption sessions can be large (hundreds of cues). Syncing all opened videos (even without bookmarks) increases server storage. Is this acceptable, or should there be a user-initiated "save to server" action separate from the bookmark-driven sync?

5. **Video index role.** The video index currently serves double duty: (a) tracking what's locally available for the bookmarks page, and (b) providing sync metadata (updatedAt, syncedAt). Should these concerns be separated?
