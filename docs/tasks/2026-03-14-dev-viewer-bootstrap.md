# Dev-viewer: IndexedDB bootstrap from fixtures

## Problem

Dev-viewer loads fixture data via `import.meta.glob` and passes `tracks` + `fetchJson3` to `CaptionPanel`. This is a different code path from video-viewer which uses `sessionOnly` (reads from IndexedDB). To make dev-viewer truly equivalent, it should also read from IndexedDB.

## Plan

Add a "Bootstrap" button on `dev-index.tsx` (analogous to `db:bootstrap` for server storage) that seeds IndexedDB from fixture JSON files.

### Bootstrap function

For each fixture:

1. Load metadata + pick first two tracks
2. Load json3 track files
3. `mergeCaptions()` to produce `MergedCaption[]`
4. `saveSession()` to IndexedDB
5. `updateVideoIndex()` for bookmarks page

### After bootstrap

- Dev-viewer switches to `sessionOnly` — reads from IndexedDB like video-viewer
- E2E tests can call the same seed function in setup (via `page.evaluate` or a shared helper)
- `import.meta.glob` stays but moves from dev-viewer to the bootstrap helper

### What changes

- `dev-index.tsx` — add "Bootstrap" button, import bootstrap helper
- `dev-viewer.tsx` — use `sessionOnly`, remove `fetchJson3` / track module loading
- New bootstrap helper (in dev-index or a shared lib) — loads fixtures into IndexedDB

## Reference

- `src/routes/dev-index.tsx` — fixture listing, add button here
- `src/routes/dev-viewer.tsx` — currently loads fixtures directly
- `scripts/youtube-json/*/` — fixture data
- `src/lib/caption-session-db.ts` — `saveSession`
- `src/lib/caption-merge.ts` — `mergeCaptions`
- `src/lib/video-index.ts` — `updateVideoIndex`

## Status

- Not started
