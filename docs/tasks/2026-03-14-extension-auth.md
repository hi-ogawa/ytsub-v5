# Extension Auth

## Problem

The web app has username/password auth (cookie-based sessions). The extension has no auth — it works entirely offline with IndexedDB. Sync hooks (`useSyncState`, `useVideoSync`) exist and work in the dev-viewer (which piggybacks on web app cookie auth), but the real extension can't use them because:

1. Extension needs its own login UI and token storage
2. Server auth middleware only accepts cookies, not bearer tokens

## Approach

### Direct fetch from extension pages, no sync in content script

Only the **MAIN world content script** is blocked by YouTube's CSP. Extension pages (bookmarks) have their own `chrome-extension://` origin and can fetch directly — no background worker proxy needed.

The content script's job is caption extraction + local bookmark editing (IndexedDB) — no server calls. Sync happens on the **bookmarks page**, which is the natural workflow: watch video → create bookmarks → open bookmarks page → sync.

Architecture:

- **Content script** — YouTube API + IndexedDB only, zero server calls
- **Bookmarks page** — login UI in header menu, direct fetch with bearer token for sync (`useVideoSync`)
- **Background worker** — minimal: video-index relay + open bookmarks on icon click (existing role)
- **Extension oRPC client** (`extension/rpc.ts`) — same `RPCLink` pattern as web app, but reads bearer token from `chrome.storage.local` and adds `Authorization` header. Aliased via Vite build so `lib/sync.ts` uses it automatically in extension builds.
- **No popup** — extension icon opens bookmarks page directly. Login/logout in the bookmarks page header dropdown. Registration nudges to web app (`/register`).

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
| `src/extension/bookmarks.tsx`        | Bookmarks page — login UI + `useVideoSync`            |
| `src/extension/content.tsx`          | Content script — no server calls                      |
| `src/extension/public/background.js` | Background worker — video-index relay only            |
| `vite.ext.config.ts`                 | Extension build — `__SERVER_URL__` define + rpc alias |

## Status

- [x] Server: accept bearer token in `requireAuth`
- [x] Server: return token in login/register body
- [x] Server: CORS for chrome-extension:// origins
- [x] Extension oRPC client with bearer token
- [x] Bookmarks page: login/logout in header menu
- [x] Bookmarks page: sync wiring via `useVideoSync`
- [x] E2E tests for bearer token auth
- [x] Content script: no sync (deferred)
- [x] No popup — icon opens bookmarks page directly
