# Retire Server-Rendered Video List

## Problem

The home page (`/`) is `video-list.tsx` — a server-only page that fetches from `orpc.videos.listVideos`. This doesn't fit the new architecture where both web app and extension are equivalent local clients backed by IndexedDB + server sync.

`dev-bookmarks.tsx` already implements the correct pattern: `BookmarksPage` + `useVideoSync` showing merged local+server videos with sync badges and per-video push/pull. The home page should adopt this same pattern.

## What Exists

### video-list.tsx (to replace)

- Server-only: `useQuery(orpc.videos.listVideos)`
- Features: video card grid, delete button per card (vert-dot dropdown), import dialog
- Badges: language pair, duration, created date

### dev-bookmarks.tsx (pattern to follow)

- Hybrid: `useVideoSync()` merges local IndexedDB + server
- Features: video card grid, sync badges (local-only/server-only/synced/push/pull)
- Badges: bookmark count, sync status
- No delete, no import

### BookmarksPage component

- Presentational, accepts: `entries`, `onVideoClick`, `sync?`, `actions?`
- `titleRight` slot on each VideoCard currently shows sync badge only

## Decisions

- **Import**: imports to **client storage** (IndexedDB), not to server. This is the "export from extension, import to web app manually without account login" flow. `ImportDialog` parses `import.json` → writes to `CaptionSessionManager` → persists to IndexedDB + `videoIndexStore`. No server call.
- **Delete**: keep as vert-dot dropdown per card, separate from sync badge. Deletes from server via `orpc.videos.deleteVideo`. Same UX as current video-list.

## Plan

Rewrite `video-list.tsx` to use `BookmarksPage` + `useVideoSync`, adding:

- Import dialog (rewritten to save to IndexedDB instead of server)
- Delete button per card (vert-dot dropdown, same as current)

### What changes

**video-list.tsx** → rewrite to ~40-60 lines:

- Data: `useVideoSync()` instead of `orpc.videos.listVideos`
- Render: `BookmarksPage` component
- Delete: extend `titleRight` to show vert-dot alongside sync badge

**Import** → move to header menu (top-right vert-dot, alongside theme toggle and logout):

- No dedicated import button on the page
- `HeaderMenu` in `root.tsx` gets an "Import" menu item that opens `ImportDialog`

**ImportDialog** → rewrite import target:

- Current: `orpc.videos.importVideo` → server DB → navigate to viewer
- New: parse `import.json` → `CaptionSessionManager` → IndexedDB + `videoIndexStore` → stay on list (or navigate to viewer, since IndexedDB session now exists)

**BookmarksPage** → add delete support:

- `titleRight` currently shows only sync badge. Need to add vert-dot dropdown for delete alongside it.
- Option A: extend `BookmarksPage` to accept `onDelete` callback, render vert-dot internally
- Option B: make `titleRight` more flexible — caller composes sync badge + delete dropdown
- Option B is cleaner — keeps BookmarksPage presentation-only

### What gets deleted

- Server video list query (`orpc.videos.listVideos`)
- Server import mutation (`orpc.videos.importVideo` call from ImportDialog)
- `formatDuration`, `formatDate` helpers
- ~200 lines of server-only code

### What stays

- `ImportDialog` component (rewritten target: IndexedDB instead of server)
- Delete dropdown (moved to BookmarksPage card via `titleRight` composition)
- Route structure (`/` → `VideoListPage`)

## Implementation steps

1. Rewrite `ImportDialog` to save to IndexedDB (`CaptionSessionManager` + `videoIndexStore`) instead of calling server
2. Move import trigger to `HeaderMenu` in `root.tsx` (alongside theme toggle / logout)
3. Rewrite `video-list.tsx` to use `BookmarksPage` + `useVideoSync`
4. Add delete dropdown to card `titleRight` (compose alongside sync badge)
5. Update e2e tests
6. Verify: `pnpm build` + `pnpm test-e2e`

## E2E impact

- `basic.spec.ts`: heading "Videos" → "Bookmarked Videos", empty state text changes, card badge assertions change (bookmark count instead of duration/language)
- `delete.spec.ts`: delete-video test needs selector updates (vert-dot position changes)
- `import.spec.ts`: import no longer calls server — need to verify IndexedDB write + video appears in list

## Reference files

- `src/routes/video-list.tsx` — to rewrite
- `src/routes/dev-bookmarks.tsx` — pattern to follow
- `src/components/bookmarks-page.tsx` — shared component
- `src/lib/sync.ts` — `useVideoSync`
- `src/lib/caption-session.ts` — `CaptionSessionManager` (for import target)
- `src/lib/video-index.ts` — `videoIndexStore` (for import target)

## Status

Planning — awaiting feedback

## Feedback Log

- **2026-03-14**: Import should target client storage (IndexedDB), not server. Delete should stay as vert-dot dropdown per card, separate from sync badge.
