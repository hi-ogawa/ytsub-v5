# Extension Sync Bug Investigation

## Problem

Four related symptoms reported when using the extension while logged in:

1. **"checking" persists** — open a new video, open the caption panel → sync status stays "Checking…" indefinitely
2. **"checking" after AI import** — import bookmarks via AI prompt → still "Checking…"
3. **No video in bookmarks page** — after AI import, open the bookmarks page → the video doesn't appear
4. **Manual bookmark add/remove unblocks things** — after manually adding or removing one bookmark → state finally shows "Unsynced changes", bookmarks page shows the video with "push" badge

## Root Causes Found

### Bug 1 — `getSyncState` rejection silently swallowed

`useExtensionSyncState` in `content.tsx`:

```ts
useEffect(() => {
  bgRpc.getSyncState({ youtubeId }).then(setServerResponse);
  // No .catch!
}, [youtubeId]);

if (!serverResponse) return "checking";
```

`bgRpc.getSyncState` goes through the relay RPC bridge (MAIN world → relay → background). If
the background service worker is temporarily unavailable (just woken from sleep, crashing, or
returning an error from the server API), the promise **rejects**. Without a `.catch`, the
rejection is swallowed silently, `setServerResponse` is never called, and state stays
`"checking"` forever — never resolving to `"synced"`, `"push"`, etc.

**Fix**: add `.catch(() => setServerResponse({ authenticated: true, serverUpdatedAt: undefined }))`
as a safe fallback. On failure we assume "authenticated, server state unknown" so the UI
computes from local data only: new video → "synced", video with local bookmarks → "push".

### Bug 2 — `chrome.storage.local.set` not awaited in background handler

`background.ts` `videoIndexUpdated`:

```ts
async videoIndexUpdated({ entries }) {
  chrome.storage.local.set({ [VIDEO_INDEX_KEY]: entries }); // no await!
},
```

In Chrome MV3 service workers, after `sendResponse` is called the worker becomes idle and
Chrome may terminate it. Without `await`, `sendResponse(undefined)` is called immediately
while `chrome.storage.local.set` is still in-flight. If Chrome terminates the worker before
the storage write is flushed, the video-index update is lost — the video never appears in the
bookmarks page.

**Fix**: `await chrome.storage.local.set(...)` so the write is guaranteed to complete before
`sendResponse` is called.

### Bug 3 — `updateVideoIndex` drops `syncedAt`

```ts
const entry: VideoIndexEntry = {
  youtubeId,
  title,
  channelName,
  bookmarkCount,
  updatedAt: new Date().toISOString(),
  // syncedAt missing — always undefined!
};
if (idx >= 0) next[idx] = entry; // replaces existing entry, losing syncedAt
```

When `updateVideoIndex` replaces an existing entry (e.g. after adding more bookmarks to a
video that was previously synced), `syncedAt` is silently dropped. On the next state
computation, `computeSyncState` sees `syncedAt = undefined` with both `localUpdatedAt` and
`serverUpdatedAt` set → returns `"conflict"` instead of the correct `"push"` or `"synced"`.

**Fix**: when replacing an existing entry preserve its `syncedAt`.

### Bug 4 — Bookmarks page doesn't react to external `chrome.storage.local` changes

`bookmarks.tsx` hydrates `videoIndexStore` from `chrome.storage.local` once in `main()`:

```ts
const entries = await chromeStorage.get<VideoIndexEntry[]>(VIDEO_INDEX_KEY);
videoIndexStore.set(entries ?? []);
```

If the content script adds bookmarks (AI import) **after** the bookmarks page is already open,
the relay → background → `chrome.storage.local` chain runs, but the bookmarks page never
picks up the change. The page shows stale data.

**Fix**: add a `chrome.storage.onChanged` listener to reactively update `videoIndexStore`
whenever `chrome.storage.local` is changed externally (i.e. by the background's
`videoIndexUpdated` handler or any other path).

## Files Changed

| File                          | Change                                                   |
| ----------------------------- | -------------------------------------------------------- |
| `src/extension/content.tsx`   | Add `.catch` fallback to `bgRpc.getSyncState()`          |
| `src/extension/background.ts` | `await chrome.storage.local.set` in `videoIndexUpdated`  |
| `src/lib/video-index.ts`      | Preserve `syncedAt` in `updateVideoIndex`                |
| `src/extension/bookmarks.tsx` | `chrome.storage.onChanged` listener for reactive updates |

## Status

- [x] Investigation complete, root causes documented
- [x] Fixes implemented
