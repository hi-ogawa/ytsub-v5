# Bookmarks Page Server Sync

## Problem

`BookmarksPage` only shows local IndexedDB videos. Users who have videos on the server can't see or pull them from the bookmarks page.

## Approach

1. Export `computeSyncState` from `sync.ts` (currently module-private)
2. Add a `serverSessionToLocal` function that pulls a server session and saves it to IndexedDB directly (without needing a `CaptionSessionManager` already open) — reuse the conversion logic from `useSyncState.pullMutation`
3. Update `BookmarksPage` to accept merged entries with sync state and a pull callback
4. Create a hook `useBookmarksSyncData` that fetches server videos, merges with local, and provides pull
5. Wire into `dev-bookmarks.tsx` (has React Query/oRPC access)
6. Extension bookmarks: show local-only entries as before; full server sync deferred (needs auth context forwarding)

## Merged entry type

```ts
type BookmarkEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncStatus:
    | "local-only"
    | "server-only"
    | "synced"
    | "pull"
    | "push"
    | "conflict";
};
```

## Key files

- `src/components/bookmarks-page.tsx` — presentational component
- `src/lib/sync.ts` — `computeSyncState`, new `serverSessionToLocal`
- `src/lib/video-index.ts` — `VideoIndexEntry`, `videoIndexStore`
- `src/lib/caption-session-db.ts` — `saveSession` for persisting pulled data
- `src/routes/dev-bookmarks.tsx` — dev-viewer wrapper
- `src/extension/bookmarks.tsx` — extension wrapper (defer full sync)

## Implementation steps

1. Export `computeSyncState` from `sync.ts`
2. Add `serverSessionToLocal(data, youtubeId)` to `sync.ts` — converts server `getFullSession` response to `PersistedCaptionSession`, saves to IndexedDB, updates video index
3. Create `useBookmarksSyncData` hook (new file or in bookmarks-page.tsx) — auth check, listVideos query, merge logic, pull mutation
4. Update `BookmarksPage` UI — sync status badge per card, pull button for server-only/pull entries
5. Update `dev-bookmarks.tsx` to use the hook
6. Extension bookmarks — pass `syncStatus: 'local-only'` for all entries (no server access yet)

## Status

- Done: `computeSyncState` exported, `pullServerSession` added, `BookmarksPage` updated with optional `BookmarksSyncHandle`, `DevBookmarksPage` wired up
- Extension bookmarks unchanged (no server access)
