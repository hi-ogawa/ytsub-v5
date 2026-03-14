# Extension Auth

## Problem

The web app has username/password auth (cookie-based sessions). The extension has no auth — it works entirely offline with IndexedDB. Sync hooks (`useSyncState`, `useVideoSync`) exist and work in the dev-viewer (which piggybacks on web app cookie auth), but the real extension can't use them because:

1. Extension content scripts run on youtube.com — no access to our server's cookies
2. Extension needs its own login UI and token storage
3. Server auth middleware only accepts cookies, not bearer tokens

## Current state

### Server auth (`server/auth.ts`, `server/routes/auth.ts`)

- HMAC-signed session token: `sign(userId:exp, AUTH_SECRET)`, 30-day TTL
- Delivered via `Set-Cookie` (httpOnly, secure, sameSite=lax)
- `requireAuth` middleware reads `session` cookie → extracts userId
- Endpoints: `register`, `login`, `logout`, `check`
- All return `{ ok: true }` — token is only in the cookie header

### Extension architecture

- **Content script** (`extension/content.tsx`): runs in MAIN world on youtube.com, renders CaptionPanel in Shadow DOM
- **Relay script** (`extension/public/relay.js`): ISOLATED world, bridges localStorage→chrome.runtime messages
- **Background worker** (`extension/public/background.js`): stores video-index in chrome.storage.local, handles action click
- **Bookmarks page** (`extension/bookmarks.tsx`): standalone HTML page, reads chrome.storage.local

### Sync infrastructure (already built)

- `lib/sync.ts`: `useSyncState()` (per-video) and `useVideoSync()` (bookmarks page)
- Both check `auth.check` first → show "unauthenticated" state if no session
- Push via `videos.importVideo`, pull via `videos.getFullSession`
- Works in dev-viewer because same-origin cookie auth

## Approach

### Auth transport: Bearer token via background worker

The extension can't use cookies (different origin). Instead:

1. Server accepts auth token in **both** cookie and `Authorization: Bearer <token>` header — same HMAC-signed token format, just different transport
2. Extension stores token in `chrome.storage.local`
3. All API calls go through the **background worker** (not content script) — avoids YouTube CSP restrictions on fetch
4. Content script sends messages to background worker, which makes authenticated fetch calls

### Why background worker for API calls

Content script runs in MAIN world (youtube.com). YouTube's CSP blocks fetch to our server. The background worker has no CSP restrictions and can fetch any URL. This is the standard Chrome extension pattern for API communication.

## Reference files

| File                                 | Role                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| `src/server/auth.ts`                 | Auth middleware — needs bearer token support            |
| `src/server/routes/auth.ts`          | Login/register endpoints — need to return token in body |
| `src/extension/public/background.js` | Background worker — needs auth + API proxy              |
| `src/extension/public/relay.js`      | Relay pattern to follow for messaging                   |
| `src/extension/content.tsx`          | Content script — needs to message background for sync   |
| `src/extension/bookmarks.tsx`        | Bookmarks page — needs auth state + sync                |
| `src/lib/sync.ts`                    | Sync hooks — need to work with extension auth           |
| `src/rpc.ts`                         | oRPC client — extension needs its own version           |
| `vite.ext.config.ts`                 | Extension build — needs server URL define               |

## Implementation steps

### Step 1: Server — accept bearer token

Modify `requireAuth` in `server/auth.ts` to check `Authorization: Bearer <token>` header when no cookie is present. Same `unsign()` + expiry check. Cookie takes priority (web app path unchanged).

Add CORS headers for the extension origin (or `*` if we don't know it — extension origins are `chrome-extension://<id>`). This may need a server middleware/plugin.

### Step 2: Server — return token in login response

Modify `login` and `register` in `server/routes/auth.ts` to include the token in the response body: `{ ok: true, token: "<signed-token>" }`. Cookie is still set for web app compatibility. Extension reads the token from the body, ignores the cookie.

### Step 3: Extension — background worker as API proxy

Rewrite `background.js` to handle API requests from content script and bookmarks page:

```
// Messages:
// { type: "api-request", method: "POST", path: "/api/auth.login", body: {...} }
//   → { type: "api-response", data: {...} } or { type: "api-error", error: "..." }
//
// { type: "get-auth-state" }
//   → { type: "auth-state", authenticated: boolean }
```

Background worker:

- Stores `serverUrl` and `sessionToken` in chrome.storage.local
- Attaches `Authorization: Bearer <token>` to all API requests
- Proxies responses back to caller

Server URL: bake into extension build via `vite.ext.config.ts` define (`__SERVER_URL__`), with option to override in chrome.storage.local (for dev).

### Step 4: Extension — login UI

Add a popup page (`extension/popup.html` + `extension/popup.tsx`):

- If not logged in: username/password form → calls login via background worker → stores token
- If logged in: shows username, logout button, link to bookmarks page
- Replaces current "open bookmarks on click" action — popup is the new default action, bookmarks gets a menu link

Update `manifest.json`:

- Add `"default_popup": "popup.html"` to `action`
- Add popup to build config in `vite.ext.config.ts`

### Step 5: Extension — wire sync into content script

Content script needs to:

1. Check auth state via background worker on load
2. If authenticated, enable sync button in CaptionPanel
3. Sync button triggers push/pull through background worker API proxy

This means the sync hooks (`useSyncState`) need an alternative fetch path. Options:

- **Option A**: Create an extension-specific oRPC link that routes through `chrome.runtime.sendMessage` instead of `fetch`
- **Option B**: Pass sync callbacks as props (simpler, avoids oRPC in extension)

Recommend **Option A** — it lets the existing `useSyncState` and `useVideoSync` hooks work unchanged. Just swap the oRPC link.

### Step 6: Extension — wire sync into bookmarks page

Bookmarks page already imports shared components. Add:

- Auth state check on load
- If authenticated, show sync status per video (reuse `useVideoSync`)
- Push/pull buttons per video

### Step 7: E2E tests (dev-viewer)

Dev-viewer already covers the sync flow with cookie auth. Add tests for:

- Bearer token auth (call API with Authorization header)
- Login endpoint returns token in body

Real extension testing is manual (Chrome extension loading).

## Open questions

1. **CORS**: Do we need explicit CORS headers? Extension background worker fetch requests may not need CORS (they're not subject to same-origin policy). Need to verify — if background worker `fetch()` to our server works without CORS headers, we can skip this.

2. **Popup vs. options page**: Popup is simpler (click icon → see form). Options page is more standard for settings. Leaning popup since login is the primary action. Could also use the bookmarks page header for login UI (no popup needed).

3. **Server URL configuration**: Hardcode via build-time define is simplest. Do we need runtime override? If so, add a field in popup settings.

## Status

- [x] Plan review
- [x] Step 1: Server bearer token support
- [x] Step 2: Server returns token in body
- [x] Step 3: Background worker API proxy
- [x] Step 4: Login popup UI
- [x] Step 5: Content script sync wiring
- [x] Step 6: Bookmarks page sync
- [x] Step 7: E2E tests
