# Sync caption sessions (not just bookmarks)

## Problem

Currently sync is bookmark-gated: a video only enters the video index (and becomes visible to sync) when it has >= 1 bookmark. Videos with 0 bookmarks are removed from the index (`syncVideoIndex()` calls `removeFromVideoIndex`). This means:

- Opening a fresh video and loading captions does **not** create a syncable entry
- The sync indicator shows "unknown" (nothing to sync) even though a full caption session exists locally
- Caption data never reaches the server until the user creates their first bookmark
- Deleting all bookmarks implicitly removes the session from the index (reactive deletion)

This matters because **the extension is the only way data enters the system** — the server cannot scrape YouTube. If a user opens a video on the extension, the captions are fetched from YouTube and stored in IndexedDB, but they're invisible to sync until bookmarked. The web app on another device can't access those captions.

## Design: "Save to library" via sync indicator

Two paths into the library:

1. **Explicit save** — sync indicator shows "Save to library" when video isn't in index. Click → persists session + enters index → becomes "Sync: upload".
2. **Implicit save via bookmark** — creating a bookmark automatically saves to library (existing behavior, kept).

### Sync indicator states for caption panel

| Video state            | Indicator                 | Click action           |
| ---------------------- | ------------------------- | ---------------------- |
| Not in library (fresh) | "Save to library" (muted) | Persist + enter index  |
| In library, not synced | "Sync: upload" (yellow)   | Navigate to video list |
| In library, synced     | "Synced" (green)          | Navigate to video list |
| Not authed             | "Sign in to sync"         | Navigate to video list |

### Session lifecycle

```
(not saved) --[click "Save to library"]--> (in library, pushable)
(not saved) --[create bookmark]----------> (in library, pushable)
(in library) --[delete all bookmarks]----> (stays in library, 0 bookmarks, still syncable)
(in library) --[explicit delete on list]-> (removed from library + IDB + server)
```

### Implementation

1. **`persistSession()` does NOT call `syncVideoIndex()`** — decoupled. Persistence (IDB) and library entry (video index) are separate concerns.
2. **`createBookmarks()` calls `syncVideoIndex()` + `persistSession()`** — implicit save on bookmark.
3. **New `saveToLibrary()` method on `CaptionSessionManager`** — calls `persistSession()` + `syncVideoIndex()`. Triggered by sync indicator click when state is "unknown".
4. **`SyncMenuItem` handles "unknown" state** — shows "Save to library", click calls `saveToLibrary()` on the store instead of navigating.
5. **Other mutations (`deleteBookmark`, `clearBookmarks`, `replace`, `updateCaptions`)** call `persistSession()` only — they update the session but don't need to re-enter the library (already there if bookmarks were created).
6. **`syncVideoIndex()` still called from mutations that change bookmark count** — to update the count in the video index. But only when the video is already in the library.

Wait — simpler: `persistSession()` should call `syncVideoIndex()` only if the video is already in the index (update count), not add it. `saveToLibrary()` and `createBookmarks()` are the only entry points.

Actually simplest: keep `syncVideoIndex()` in `persistSession()` but make `syncVideoIndex()` only update existing entries, not create new ones. New method `addToLibrary()` creates the entry.
