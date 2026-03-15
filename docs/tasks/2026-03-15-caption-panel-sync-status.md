# Caption Panel Sync Status Indicator

## Problem

The extension content script's CaptionPanel has no sync awareness. Users create bookmarks on YouTube but have no indication whether those bookmarks are synced to the server. They must open the bookmarks page (extension icon click) to discover sync status and act on it.

**Goal:** Show a lightweight, read-only sync status indicator in the caption panel header with a link to the bookmarks page where sync actions live. No sync mutations in the caption panel itself.

## Architecture Constraints

The content script runs in **MAIN world** on `youtube.com`. This creates constraints:

| Layer                     | Can access                            | Cannot access                  |
| ------------------------- | ------------------------------------- | ------------------------------ |
| MAIN world (content.tsx)  | localStorage, DOM, window events      | chrome.runtime, chrome.storage |
| ISOLATED world (relay.ts) | chrome.runtime, localStorage          | MAIN world JS objects          |
| Background worker         | chrome.storage, chrome.runtime, fetch | DOM, localStorage              |
| Bookmarks page            | chrome.storage, authenticated fetch   | youtube.com localStorage       |

**Current messaging flow (one-way):**

```
MAIN world → localStorage event → relay.ts → chrome.runtime.sendMessage → background → chrome.storage.local
```

## Sync State via Background Worker

The background worker can make authenticated API calls — it has access to `chrome.storage.local` (session token) and isn't constrained by YouTube's CSP. We can get **full sync state** (including "needs pull") by proxying through the relay.

### Messaging flow (bidirectional)

```
MAIN world                    ISOLATED world (relay.ts)       Background worker
─────────                     ───────────────────────         ─────────────────
dispatch event ─────────────→ listen for event
  "zamak:get-sync-state"      sendMessage({type, youtubeId}) → receives message
  {youtubeId}                                                  read token from chrome.storage
                                                               fetch getVideoUpdatedAt(youtubeId)
                              ←─────────────────────────────── return response
                              write result to localStorage
                              dispatch event "zamak:sync-state-result"
←──────────────────────────── MAIN world reads localStorage
```

`chrome.runtime.sendMessage` supports **async responses** — relay.ts can `await` the background's reply and write the result to localStorage for MAIN world consumption.

### Background handler

```ts
// background.ts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "get-sync-state") {
    handleGetSyncState(msg.youtubeId).then(sendResponse);
    return true; // keep channel open for async response
  }
});

async function handleGetSyncState(youtubeId: string) {
  const token = await chromeStorage.get<string>("session-token");
  if (!token) return { authenticated: false };
  // fetch serverUpdatedAt using plain fetch (not orpc — background has no React)
  const res = await fetch(`${SERVER_URL}/api/videos.getVideoUpdatedAt`, { ... });
  return { authenticated: true, serverUpdatedAt: data.updatedAt };
}
```

### Sync state computation in content script

With `serverUpdatedAt` from background + local `updatedAt`/`syncedAt` from videoIndexStore, content script can run `computeSyncState()` and get full state: synced, push, pull, conflict.

**New prop on CaptionPanel:**

```ts
syncStatus?: {
  state: "synced" | "push" | "pull" | "conflict" | "checking" | "unauthenticated"
  onNavigate: () => void
}
```

- `state` computed from local videoIndexStore + server response via background
- `onNavigate` opens the bookmarks page
- Read-only — no push/pull mutations, just status + link

### Fetch once on boot

Server state is fetched **once** when the content script mounts (or on YouTube SPA navigation to a new video), not polled or refetched. Same model as `bookmarks.tsx` which hydrates from `chrome.storage.local` once in `main()` before rendering. This keeps things simple — no reactive server queries, no refetch-on-focus. If the user syncs on the bookmarks page and returns to YouTube, the content script re-injects on SPA navigation and fetches fresh state.

### 2. Open bookmarks page — new message through relay

Content script (MAIN world) can't call `chrome.tabs.create`. Need reverse messaging:

```
MAIN world dispatches event → relay.ts listens → chrome.runtime.sendMessage → background opens tab
```

**relay.ts** — add listener for a new event:

```ts
window.addEventListener("zamak:open-bookmarks", () => {
  chrome.runtime.sendMessage({ type: "open-bookmarks" });
});
```

**background.ts** — handle new message type:

```ts
if (parsed.type === "open-bookmarks") {
  chrome.tabs.create({ url: "bookmarks.html" });
}
```

**content.tsx** — dispatch event when user clicks the indicator:

```ts
const openBookmarks = () =>
  window.dispatchEvent(new Event("zamak:open-bookmarks"));
```

### 3. UI — status indicator in caption panel header

A small icon button in the header (same style as existing header buttons), showing:

- **Synced:** green check icon (CheckCircle2)
- **Push / Pull / Conflict:** yellow indicator — signals "action available on bookmarks page"
- **Unauthenticated:** muted login icon
- **Checking:** spinner

Clicking any state opens the bookmarks page (or navigates to video list in web app).
Only shown when the video has bookmarks (has a videoIndex entry). Hidden otherwise.

### 4. CaptionPanel API: `sync` vs `syncStatus`

CaptionPanel currently has `sync?: SyncHandle` (full interactive push/pull). This task adds `syncStatus` as the read-only alternative. The two props serve different surfaces:

| Surface                  | Prop         | Data source                            | Mutations                    |
| ------------------------ | ------------ | -------------------------------------- | ---------------------------- |
| Extension content script | `syncStatus` | relay → background → server            | None (navigate to bookmarks) |
| `/dev/videos/:id`        | `syncStatus` | `useSyncState` → stripped to read-only | None (navigate to `/dev`)    |
| Web app `/videos/:id`    | `sync`       | `useSyncState` (orpc)                  | Full push/pull               |

**`/dev` mirrors extension** — dev-viewer currently passes `sync={syncState}` (full SyncHandle), but should switch to `syncStatus` to match the extension's read-only indicator. It can derive from `useSyncState` since orpc is available in dev:

```ts
// dev-viewer.tsx
const sync = useSyncState({ youtubeId });
const syncStatus = { state: sync.state, onNavigate: () => navigate("/dev") };
<CaptionPanel syncStatus={syncStatus} ... />
```

**Web app video-viewer keeps `sync`** — it's a different UI surface (already shipped as "feat(web): sync button for video-viewer"), not mirroring the extension.

**CaptionPanel renders one or the other**, never both. If `sync` is provided, the existing interactive SyncButton renders. If `syncStatus` is provided, the read-only indicator renders.

## Implementation Steps

1. **background.ts** — handle `"get-sync-state"` (fetch serverUpdatedAt with auth token) and `"open-bookmarks"` message types
2. **relay.ts** — listen for `"zamak:get-sync-state"` and `"zamak:open-bookmarks"` events, forward to background, write responses to localStorage
3. **content.tsx** — on mount/video change: dispatch get-sync-state event, read response, compute state with `computeSyncState()`, pass `syncStatus` prop to CaptionPanel
4. **caption-panel.tsx** — add `syncStatus` prop, render read-only status indicator in header (clickable, opens bookmarks page)
5. **Dev route** — pass mock `syncStatus` for testing
6. **prd.md** — update task description to reflect the change (status indicator, not full sync)

## Reference Files

| File                               | Role                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| `src/extension/content.tsx`        | Renders CaptionPanel in MAIN world — add syncStatus prop |
| `src/extension/relay.ts`           | ISOLATED world relay — add open-bookmarks event listener |
| `src/extension/background.ts`      | Service worker — handle open-bookmarks message           |
| `src/components/caption-panel.tsx` | Shared component — add syncStatus indicator UI           |
| `src/lib/video-index.ts`           | videoIndexStore with updatedAt/syncedAt fields           |
| `src/lib/sync.ts`                  | Full sync logic (reference, not used in content script)  |

## Open Questions

- Should we show a count badge (e.g., "3 unsynced") or keep it minimal (just icon)?

## Feedback Log

- Use background worker as proxy to get full sync state (including server-side "needs pull"), not local-only
- Fetch server state once on content script boot (not polled) — same model as bookmarks.tsx hydration
- dev-viewer must use `syncStatus` (not full `sync`) to mirror extension behavior

## Status

- [x] Investigation complete
- [ ] Plan approved
- [ ] Implementation
