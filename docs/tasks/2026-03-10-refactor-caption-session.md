# Refactor `useCaptionSession` hook

## Problem

`src/lib/caption-session.ts` is a ~340-line god hook that mixes 6+ concerns:

1. **Track selection** + localStorage persistence
2. **Session hydration** from IndexedDB (load/save/delete)
3. **Caption fetching** (two `useQuery` calls) + merging
4. **Caption overrides** (editable text)
5. **Bookmark CRUD** (add, delete, update, clear)
6. **Export** (DOM manipulation — creating `<a>` tag and clicking it)

### Specific smells

- **Side effects inside `setState` updaters** — `addBookmarks`, `deleteBookmark`, `updateBookmarks` all call `persistSession()` and `syncVideoIndex()` inside `setBookmarks()` callbacks. Mixes state transitions with async I/O.
- **Confusing hydration state** — `null` means "loading", `undefined` means "no session", truthy means "loaded". The check `hydrated != null && hydrated !== undefined` is just `!!hydrated` written confusingly.
- **Duplicated track lookup** — hook computes `sel1`/`sel2` internally but only exposes `selectedVssId1`/`selectedVssId2`. Both callers (`dev-viewer.tsx:85-89`, `content.tsx:124-128`) re-derive `sel1`/`sel2` from the returned IDs to get `languageCode`.
- **Export = DOM in a data hook** — `handleExport` creates an `<a>` element and clicks it. This is UI/browser behavior in a data-management hook.
- **Fragile `persistSession` closure** — depends on `rows`, `sel1`, `sel2` captured at callback-creation time. Called inside setState updaters where these may be stale.

## Approach

Extract focused sub-hooks, then compose them in the main `useCaptionSession`. Keep the public return type (`CaptionSessionManager`) identical so callers don't need changes.

### 1. Extract `useTrackSelection(tracks, youtubeId, hydratedVssIds?)`

- Owns `selectedVssId1`, `selectedVssId2`, `setTracks`
- Handles localStorage read/write (the `getInitialTracks` / `saveSelectedTracks` functions)
- Accepts override from hydrated session
- **Also returns** `sel1` / `sel2` (resolved track objects) so callers don't re-derive

### 2. Extract `useCaptionData(sel1, sel2, fetchJson3, hydrated)`

- Owns the two `useQuery` calls + `mergeCaptions` call
- Owns `captionOverrides` + `updateCaptions`
- Returns `rows`, `activeStrategy`, `isAutoStrategy`, `error`
- Skips fetching when hydrated

### 3. Extract `useBookmarks(youtubeId, videoMeta, rows, sel1, sel2)`

- Owns `bookmarks` state, `bookmarksByIndex` memo
- CRUD: `addBookmarks`, `deleteBookmark`, `updateBookmarks`, `clearBookmarks`
- Owns persistence (calls `saveSession`/`deleteSession`, `updateVideoIndex`/`removeFromVideoIndex`)
- **Fix**: move persistence out of setState updaters — use a helper that updates state then persists, rather than persisting inside the updater function

### 4. Move export to a standalone function

- `exportSessionJson(videoMeta, rows, bookmarks, sel1, sel2)` — pure function that returns a `Blob` or triggers download
- Called from the hook but logic lives outside

### 5. Return `sel1`/`sel2` from hook

- Add `selectedTrack1` and `selectedTrack2` to the return value
- Callers can drop their manual `.find()` lookups

## Implementation steps

1. Extract `useTrackSelection` within the same file (keep it in `caption-session.ts` to avoid unnecessary file splits per AGENTS.md)
2. Extract `useCaptionData` within the same file
3. Extract `useBookmarks` within the same file
4. Move export logic to a standalone `exportSessionJson` function
5. Add `selectedTrack1`/`selectedTrack2` to return value
6. Simplify callers (`dev-viewer.tsx`, `content.tsx`) to use `selectedTrack1`/`selectedTrack2`
7. Run `pnpm tsc && pnpm lint && pnpm build`
8. Run `pnpm test-e2e` to verify no regressions

## Reference files

- `src/lib/caption-session.ts` — the file being refactored
- `src/lib/caption-session-db.ts` — IndexedDB persistence (unchanged)
- `src/lib/extension-bookmarks.ts` — bookmark types (unchanged)
- `src/routes/dev-viewer.tsx` — consumer (simplify)
- `src/extension/content.tsx` — consumer (simplify)
- `src/lib/zamak-api.ts` — consumer (may simplify)

## Status

- [x] Implementation — all 5 changes applied
- [x] Verification — tsc, lint, build all pass. API e2e tests pass. Browser e2e tests blocked by missing Playwright browsers in CI environment (not a code issue).

### Changes made

- `src/lib/caption-session.ts` — extracted `useSessionHydration`, `useTrackSelection`, `useCaptionData`, `useBookmarks` sub-hooks + `triggerExportDownload` standalone function. Fixed side-effects-in-setState by using refs + direct state setting. Exported `VideoMeta` type. Added `selectedTrack1`/`selectedTrack2` to return value.
- `src/routes/dev-viewer.tsx` — removed duplicated track `.find()` lookups, use `session.selectedTrack1`/`selectedTrack2`
- `src/extension/content.tsx` — same simplification
- `src/lib/zamak-api.ts` — import `VideoMeta` from caption-session instead of duplicating
