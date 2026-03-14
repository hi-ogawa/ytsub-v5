# Extension Auth

## Problem

The web app has username/password auth (cookie-based sessions). The extension has no auth — it works entirely offline with IndexedDB. Sync hooks (`useSyncState`, `useVideoSync`) exist and work in the dev-viewer (which piggybacks on web app cookie auth), but the real extension can't use them because:

1. Extension needs its own login UI and token storage
2. Server auth middleware only accepts cookies, not bearer tokens

## Approach

### Direct fetch from extension pages, no sync in content script

Key insight: only the **MAIN world content script** is blocked by YouTube's CSP. Extension pages (popup, bookmarks) have their own `chrome-extension://` origin and can fetch directly.

The content script's job is caption extraction + local bookmark editing (IndexedDB) — no server calls needed. Sync happens on the **bookmarks page**, which is the natural workflow: watch video → create bookmarks → open bookmarks page → sync.

Architecture:

- **Content script** — YouTube API + IndexedDB only, zero server calls
- **Popup page** — direct fetch to server for login, token stored in `chrome.storage.local`
- **Bookmarks page** — direct fetch with bearer token for sync (`useVideoSync`)
- **Background worker** — minimal: video-index relay only (existing role)
- **Extension oRPC client** (`extension/rpc.ts`) — same `RPCLink` pattern as web app, but reads bearer token from `chrome.storage.local` and adds `Authorization` header. Aliased via Vite build so `lib/sync.ts` uses it automatically in extension builds.

### Server changes

1. `requireAuth` middleware accepts `Authorization: Bearer <token>` as fallback when no cookie
2. `login`/`register` return token in response body (`{ ok: true, token }`)
3. CORS headers for `chrome-extension://` origins

### Future: content script sync

If we want sync in the caption panel later, the content script would need its own RPC path through the background worker (CSP constraint). This is deferred — bookmarks page sync is sufficient for now.

## Reference files

| File                                 | Role                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| `src/server/auth.ts`                 | Auth middleware — bearer token support                |
| `src/server/routes/auth.ts`          | Login/register — returns token in body                |
| `src/server/index.ts`                | CORS for chrome-extension:// origins                  |
| `src/extension/rpc.ts`               | Extension oRPC client — bearer token via direct fetch |
| `src/extension/popup.tsx`            | Login popup — direct fetch to server                  |
| `src/extension/bookmarks.tsx`        | Bookmarks page — uses `useVideoSync`                  |
| `src/extension/content.tsx`          | Content script — no server calls                      |
| `src/extension/public/background.js` | Background worker — video-index relay only            |
| `vite.ext.config.ts`                 | Extension build — `__SERVER_URL__` define + rpc alias |

## Status

- [x] Server: accept bearer token in `requireAuth`
- [x] Server: return token in login/register body
- [x] Server: CORS for chrome-extension:// origins
- [x] Extension oRPC client with bearer token
- [x] Login popup UI (direct fetch)
- [x] Bookmarks page sync wiring
- [x] E2E tests for bearer token auth
- [x] Content script: no sync (deferred)
