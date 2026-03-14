# Consolidate Caption Panel for Extension/Dev-Viewer/Video-Viewer

## Problem

Two independent caption/bookmark UIs exist with ~600 lines of duplicated code in `video-viewer.tsx`. The extension path (`caption-panel.tsx` + `caption-list.tsx`) is the richer, more complete implementation. The server app viewer code is early-stage and can be freely rearchitected.

## Architecture Decision

**Both web app and extension are truly equivalent local clients.** Both use `CaptionSessionManager` (IndexedDB) + `CaptionPanel` for UI. The server DB is a sync target, not the primary data source for the UI.

The `dev-*` routes were built as extension-equivalent emulations for testing, but they turn out to be the architecture for the real web app routes too. The main routes (`video-list`, `video-viewer`) should adopt the same pattern.

### Route mapping

| Dev route (keep for testing)                      | Web app route (rewrite)                | Role                    |
| ------------------------------------------------- | -------------------------------------- | ----------------------- |
| `dev-index.tsx` — fixture video list              | (dev-only, no equivalent)              | Test fixture listing    |
| `dev-bookmarks.tsx` — IndexedDB `videoIndexStore` | `video-list.tsx` — same + server merge | Video/bookmarks listing |
| `dev-viewer.tsx` — `CaptionPanel` from IndexedDB  | `video-viewer.tsx` — same pattern      | Caption viewer          |

- **dev-\* routes stay** as direct extension-equivalent emulation with fixture data for testing
- **Main routes adopt the same architecture** but with real data (IndexedDB populated via server sync)

### Data flow

- **Extension**: YouTube fetch → IndexedDB → `CaptionPanel` renders. Sync pushes to server.
- **Web app**: Video list page pulls from server → IndexedDB. Viewer opens session from IndexedDB → `CaptionPanel` renders. Identical to extension reopening a video.

The extension is the **only** way data enters the system (web app cannot fetch YouTube API data). The web app only sees data after it's been synced from the extension.

### User flow (web app)

1. User opens **video list** in web app — merges local IndexedDB entries with server-synced data (like `dev-bookmarks.tsx` + server)
2. User clicks "pull" on a server video → sync pulls session into IndexedDB (`serverSessionToLocal`)
3. User clicks video → opens viewer
4. Viewer does `getSession(youtubeId)` from IndexedDB — **identical to extension**

The viewer never fetches from server. The list page handles sync. By the time the viewer opens, the session is already in IndexedDB.

### Why this works

- Server app is early-stage, free to rearchitect
- Extension/client-only path is proven and feature-complete
- `CaptionPanel` already handles "session exists in IndexedDB" case — `initialStoreQuery` finds it and skips track picker, goes straight to `CaptionPanelWithStore`
- No conversion helpers, no abstraction layers, no divergent code paths

### Dependency

This task naturally combines with the prd.md task:

> `[ ] feat: bookmarks page server sync — merge server videos into BookmarksPage`

The video list page is what populates IndexedDB for the web app viewer via sync pull.

## What Changes

### video-viewer.tsx → same pattern as dev-viewer

Current: ~980 lines with its own `Bookmark` type, `highlightText`, `BookmarkWord`, `BookmarksList`, virtualizer, mutations, etc.

After: ~50-80 lines — same pattern as `dev-viewer.tsx`. Opens session from IndexedDB, renders `CaptionPanel` + YouTube player.

```tsx
// Pseudocode — mirrors dev-viewer.tsx
function VideoViewerPage() {
  const { youtubeId } = useParams();
  const [panelOpen, togglePanel] = useFabOpen(youtubeId);
  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId);
  const syncState = useSyncState({ youtubeId });

  // CaptionPanel handles getSession() from IndexedDB internally
  return (
    <div>
      <YouTubeEmbed ref={playerElRef} />
      {panelOpen && (
        <CaptionPanel
          tracks={[]}        // no track picking — session already exists
          player={player}
          fetchJson3={...}    // never called — session loaded from IndexedDB
          videoMeta={...}     // from IndexedDB session or route state
          sync={syncState}
        />
      )}
      <CaptionFab open={panelOpen} onClick={togglePanel} />
    </div>
  );
}
```

### video-list.tsx → same pattern as dev-bookmarks + server merge

Current: ~280 lines, purely server-based (`orpc.videos.listVideos`), import dialog.

After: merges local IndexedDB `videoIndexStore` entries with server video list. Each video shows sync status. Pull button to sync server data into IndexedDB. Replaces current server-only listing.

### What gets deleted

- All duplicate UI code in `video-viewer.tsx` (~900 lines)
- `@tanstack/react-virtual` dependency (drop virtualization)
- Inline `YTPlayer` interface (use shared from `youtube-player.tsx`)
- `useDebouncedTimeout` hook
- Server bookmark mutations (create/delete) in viewer
- Server caption/bookmark queries in viewer (data comes from IndexedDB)
- `highlightText`, `BookmarkWord`, `BookmarksList`, `extractBookmarkSelection`, `formatTimestamp` (all duplicates)

### What stays unchanged

- `caption-panel.tsx` — no changes needed
- `caption-list.tsx` — no changes needed
- `caption-session.ts` / `CaptionSessionManager` — no changes needed
- `dev-viewer.tsx` — stays for testing
- `dev-bookmarks.tsx` — stays for testing
- Extension content script — no changes needed

## Implementation Steps

1. Implement video list server sync (merge server videos with local IndexedDB, pull button)
2. Rewrite `video-viewer.tsx` to use `CaptionPanel` with IndexedDB session (like dev-viewer)
3. Remove `@tanstack/react-virtual` dependency
4. Update e2e tests
5. Verify: `pnpm build` + `pnpm test-e2e`

## Open Questions

- **CaptionPanel props when no tracks**: `CaptionPanel` requires `tracks` and `fetchJson3` props. When the session already exists in IndexedDB, these are unused — `initialStoreQuery` finds the session and skips to `CaptionPanelWithStore`. Could pass empty `tracks=[]` and a noop `fetchJson3`, or refactor `CaptionPanel` to make them optional when a session exists.
- **videoMeta for the viewer**: Currently the viewer gets video metadata from the server API. In the new model, this comes from IndexedDB session. `CaptionSessionManager` already persists `videoMeta` (title, channel, duration).
- **Route structure**: Current route is `/videos/:id` (server DB integer ID). Should change to `/videos/:youtubeId` (string) since IndexedDB is keyed by `youtubeId`.
- **Import dialog**: Current `video-list.tsx` has an import dialog for `import.json` upload. This may still be useful as a way to get data into the system without the extension. Keep or drop?

## Reference Files

- `src/components/caption-panel.tsx` — source of truth, used as-is
- `src/components/caption-list.tsx` — used as-is
- `src/routes/video-viewer.tsx` — to be rewritten
- `src/routes/video-list.tsx` — to be rewritten
- `src/routes/dev-viewer.tsx` — reference pattern for viewer rewrite
- `src/routes/dev-bookmarks.tsx` — reference pattern for list rewrite
- `src/lib/caption-session.ts` — `CaptionSessionManager`
- `src/lib/caption-session-db.ts` — `getSession` / `saveSession` (IndexedDB)
- `src/lib/sync.ts` — `useSyncState`, `serverSessionToLocal`
- `src/components/bookmarks-page.tsx` — reusable bookmarks listing component

## Status

- Video-viewer migration done (PR #104)
- Follow-up: dev-viewer IndexedDB bootstrap → `docs/tasks/2026-03-14-dev-viewer-bootstrap.md`

## Feedback Log

- **2026-03-14**: Drop virtual list, video-viewer read-only for now.
- **2026-03-14**: Reframe — both web app and extension are equivalent local clients. Server app code is early-stage, free to rearchitect.
- **2026-03-14**: Web app cannot fetch YouTube API data — extension is the only data source. Viewer reads from IndexedDB, not server.
- **2026-03-14**: dev-_ routes were test emulations but turn out to be the real architecture. Main routes (video-list, video-viewer) should adopt the same pattern. dev-_ stay for testing with fixtures.
