# Extension IndexedDB Cross-Origin Bug

## Problem

Caption sessions are stored in IndexedDB (`zamak` database, `caption-sessions` store) via `caption-session-db.ts`. IndexedDB is origin-scoped:

- **Content script** (MAIN world on `youtube.com`) → writes to `youtube.com`'s IndexedDB
- **Bookmarks page** (`chrome-extension://<id>/bookmarks.html`) → reads from extension origin's IndexedDB

These are **different databases**. When `useVideoSync().onPush()` calls `getSession(youtubeId)` from the bookmarks page, it always returns `undefined` because the data lives on youtube.com's origin.

Similarly, `pullMutation` calls `saveSession()` on the extension origin — the content script on youtube.com will never see that data.

The video-index doesn't have this problem because it's explicitly bridged via `chrome.storage.local` (bookmarks.tsx:146-155).

### Affected code paths

- `sync.ts:onPush()` → `getSession()` → reads wrong IDB → returns undefined → "No local session found"
- `sync.ts:pullMutation` → `saveSession()` → writes to wrong IDB → content script can't see pulled data
- `video-list.tsx:deleteSession()` → deletes from wrong IDB → no effect on actual data

### Not affected

- **Web app** (`/videos/:id`): same origin for both viewer and video list, IDB works correctly
- **Content script sync display**: uses `bgRpc.getSyncState()` which checks server via background worker — no IDB involved
- **Video index**: already bridged through `chrome.storage.local`

## Solution: Reverse RPC via content script tab

Extend the existing RPC mechanism to support reverse direction: bookmarks page → background → relay → MAIN world content script. The content script (on youtube.com) has access to the correct IDB. Background handles all server API calls (content script never talks to server directly — unchanged).

Assumption: at least one YouTube tab with the content script is open when syncing from the bookmarks page. This is reasonable since the user just came from watching a video.

### Push flow

```
Bookmarks page: onPush(youtubeId)
  → chrome.runtime.sendMessage to background
Background: bgRpc handler "pushSession"
  → chrome.tabs.query for YouTube tab
  → chrome.tabs.sendMessage(tabId, {type: "zamak-tab-rpc", method: "getSession", params: {youtubeId}})
Relay (ISOLATED world): chrome.runtime.onMessage listener
  → dispatches CustomEvent to MAIN world
MAIN world (content script): handler reads getSession(youtubeId) from youtube.com IDB
  → responds via custom event
Relay: picks up response → sendResponse back to background
Background: receives session data → calls orpc.videos.importVideo (has auth token)
  → returns success to bookmarks page
```

### Pull flow

```
Bookmarks page: onPull(youtubeId)
  → chrome.runtime.sendMessage to background
Background: bgRpc handler "pullSession"
  → calls orpc.videos.getFullSession (has auth token)
  → converts to PersistedCaptionSession via serverSessionToLocal()
  → chrome.tabs.sendMessage(tabId, {type: "zamak-tab-rpc", method: "saveSession", params: session})
Relay → MAIN world: saves to youtube.com IDB via saveSession()
  → responds with success
Background: updates video-index via chrome.storage.local
  → returns success to bookmarks page
```

### When no YouTube tab is open

Background's `chrome.tabs.query({url: "https://www.youtube.com/*"})` returns empty. UI shows "Open a YouTube tab to sync" message. Could also auto-open a YouTube tab if desired.

### Properties

- Content script never calls server directly (unchanged)
- Single source of truth for session data (youtube.com IDB, no duplication)
- No new permissions (already has `storage`)
- No storage size concerns (no bridging through chrome.storage.local)
- Bookmarks page remains the sync control surface
- Extends existing RPC pattern (`extension-rpc.ts`) with a reverse channel

## Key files

- `src/extension/lib/extension-rpc.ts` — existing RPC mechanism, needs reverse channel (`zamak-tab-rpc`)
- `src/lib/caption-session-db.ts` — IndexedDB storage (origin-scoped, root of the issue)
- `src/lib/sync.ts` — `useVideoSync` (bookmarks page sync), `useSyncState` (viewer sync)
- `src/extension/content.tsx` — MAIN world, needs to register tab RPC handlers for `getSession`/`saveSession`
- `src/extension/bookmarks.tsx` — extension bookmarks page, needs to route sync through background
- `src/extension/background.ts` — needs new handlers that bridge bookmarks page ↔ content script tab ↔ server
- `src/extension/relay.ts` — needs reverse listener: `chrome.runtime.onMessage` → CustomEvent to MAIN world

## Implementation steps

1. **Add reverse RPC channel to `extension-rpc.ts`**
   - New message type `zamak-tab-rpc` (distinct from existing `zamak-rpc`)
   - `registerTabRpcHandlers(handlers)` — MAIN world registers handlers (like background's `registerRpcHandlers`)
   - `setupTabRpcRelay()` — relay listens for `chrome.runtime.onMessage` with `zamak-tab-rpc`, dispatches CustomEvent to MAIN world, returns response
   - Background helper: `callTab(tabId, method, params)` — sends `chrome.tabs.sendMessage` and returns response

2. **Register MAIN world handlers in content script**
   - `content.tsx` registers handlers: `getSession`, `saveSession`, `deleteSession`
   - These call `caption-session-db.ts` functions directly (same origin, IDB works)

3. **Add background bridge handlers**
   - `pushSession({ youtubeId })`: find YouTube tab → `callTab("getSession", {youtubeId})` → call server `importVideo` → `setSyncedAt`
   - `pullSession({ youtubeId })`: call server `getFullSession` → `serverSessionToLocal()` → find YouTube tab → `callTab("saveSession", session)` → update video-index
   - `deleteSessionOnTab({ youtubeId })`: find YouTube tab → `callTab("deleteSession", {youtubeId})`
   - Helper: `findYouTubeTab()` — `chrome.tabs.query({url: "https://www.youtube.com/*"})`, returns first tab or throws

4. **Wire bookmarks page sync through background**
   - `useVideoSync` in extension context: `onPush`/`onPull` call background RPC handlers instead of reading/writing IDB directly
   - Extension bookmarks page uses `bgRpc.pushSession`/`bgRpc.pullSession` instead of `orpc` + local IDB
   - Handle "no YouTube tab" error gracefully in UI

5. **Update relay.ts**
   - Add `setupTabRpcRelay()` call alongside existing `setupRpcRelay()`

## Alternative considered: YouTube embed iframe inside extension page

Investigated embedding `<iframe src="https://www.youtube.com/embed/">` in the extension bookmarks page so a content script (with `all_frames: true`) could inject into the iframe and access `youtube.com`-origin IDB — removing the requirement for an open YouTube tab.

This approach was prototyped in `ytsub-v4` (`src/entrypoints/caption-editor/main.tsx`) and verified to work for **API access** (fetching metadata via the content script in the embed iframe). The `/embed/` endpoint allows framing (unlike regular YouTube pages which set `X-Frame-Options: SAMEORIGIN`).

**However, it doesn't solve the IDB problem.** Chrome's [storage partitioning](https://developer.chrome.com/docs/privacy-sandbox/storage-partitioning/) keys third-party iframe storage by the top-level origin. An embed iframe inside `chrome-extension://...` gets a separate IDB partition from the real `youtube.com` tab where sessions are written. The iframe's IDB would be empty — it can't see data written by the content script on an actual YouTube tab.

Tab RPC is the correct solution for cross-origin IDB access.

## Status

- Done: reverse RPC channel implemented, all steps complete
- `pnpm tsc` / `pnpm lint` / `pnpm build` pass
- All 60 e2e tests pass
- Needs manual testing in Chrome with the extension loaded
