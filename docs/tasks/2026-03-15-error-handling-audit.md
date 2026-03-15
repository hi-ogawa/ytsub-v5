# Error Handling Audit

## Problem

No systematic error handling strategy exists. Errors are handled inconsistently across mutation and query call sites — some show messages, most fail silently.

## Two UI paths — different strategies

### Web app (`app.tsx` QueryClient)

Has oRPC mutations (login, logout, delete, sync). Most mutation failures are silent. **Fix: sonner toast + global `mutations.onError`** — catches everything with zero per-component work. Login/register keep inline error messages (better UX for forms).

### Extension / dev-viewer (`content.tsx` QueryClient)

Client-only. Queries: YouTube API, json3 tracks, IndexedDB session. No mutations (sync will be dropped from caption-panel). Errors are already shown inline in `ExtensionViewer`. **Keep as-is** — inline display is appropriate for "can't load content" errors, and shadow DOM makes toast portaling awkward for little benefit.

## Findings

### QueryClient defaults (src/app.tsx:16)

`new QueryClient()` with zero configuration. No global `onError`, no default retry policy, no error callbacks. React Query's defaults apply: 3 retries with exponential backoff for queries, 0 retries for mutations.

### Server-side error types (src/server/)

Mixed usage of `ORPCError` (typed, with status codes) and plain `Error`:

| Location                  | Error type                  | Example                   |
| ------------------------- | --------------------------- | ------------------------- |
| `auth.ts` middleware      | `ORPCError("UNAUTHORIZED")` | Session invalid           |
| `routes/auth.ts` login    | `ORPCError("UNAUTHORIZED")` | Bad credentials           |
| `routes/auth.ts` register | `ORPCError("CONFLICT")`     | Duplicate username        |
| `routes/videos.ts` all    | plain `Error`               | "Video {id} not found"    |
| `routes/bookmarks.ts`     | plain `Error`               | "Bookmark {id} not found" |

Plain `Error` thrown from handlers becomes a generic 500 to the client — the message text is not reliably transmitted. The server interceptor (`src/server/index.ts:10-18`) only logs and rethrows.

### Client mutation error handling by call site

| Call site                          | Error display                         | Notes                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login (`login.tsx`)                | Inline "Invalid username or password" | Hardcoded message, doesn't use server error                                                                                                                                                      |
| Register (`login.tsx`)             | Inline "Registration failed"          | Same pattern                                                                                                                                                                                     |
| Logout (`root.tsx:85`)             | **None**                              | Silent failure                                                                                                                                                                                   |
| Delete video (`video-list.tsx:15`) | **None**                              | Silent failure; also has a race: local delete runs unconditionally even if server delete hasn't started                                                                                          |
| Sync push (`sync.ts:105`)          | Error stored in `error` state         | SyncButton shows tooltip on hover only when `state === "error"`, but `computedState` only returns "error" for serverQuery failures — push/pull mutation errors don't transition to "error" state |
| Sync pull (`sync.ts:115`)          | Same as push                          | Same issue                                                                                                                                                                                       |
| Video list push (`sync.ts:261`)    | **None**                              | Fire-and-forget `.mutate()`                                                                                                                                                                      |
| Video list pull (`sync.ts:238`)    | **None**                              | Error swallowed inside `withSyncing`                                                                                                                                                             |

### Client query error handling

| Query                                              | Error display                     | Notes                                                                         |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `initialStoreQuery` (caption-panel.tsx:419)        | **None**                          | Returns null on pending, silently fails on error                              |
| `storeQuery` (caption-panel.tsx:573)               | `String(storeQuery.error)` in red | Raw error object stringified — may show "[object Object]" or internal details |
| `serverQuery` in `useSyncState` (sync.ts:75)       | Drives `"error"` sync state       | Shows icon+tooltip, but only for this one query                               |
| `authQuery` (sync.ts:72)                           | **None**                          | 3 retries (RQ default), then silent                                           |
| Extension `fetchPlayerApi` (extension/content.tsx) | `String(error)` in red            | Inline display, appropriate for extension                                     |

### Sync state bug

`useSyncState` returns `error` from `pushMutation.error ?? pullMutation.error`, but the `state` field is computed as `isSyncing ? "syncing" : computedState`. The `computedState` only checks `serverQuery.isError` — it never checks push/pull mutation errors. So after a push/pull failure, `state` reverts to "push"/"pull" (the computed value), while `error` is set. The SyncButton only shows the error icon when `state === "error"`, so **push/pull failures are invisible to the user**.

### Delete race condition

In `video-list.tsx:26-32`, `deleteMutation.mutate()` is fire-and-forget, then `removeFromVideoIndex()` and `deleteSession()` run immediately. If the server delete fails (network error, auth expired), the local data is already gone.

### No global error boundary

No React ErrorBoundary anywhere in the tree. An unhandled render error crashes the whole app with a white screen.

## Plan

### Global toast for web app (main deliverable)

- `pnpm add sonner`
- Mount `<Toaster>` in `app.tsx`
- Add `defaultOptions.mutations.onError` on the web app QueryClient
- Login/register keep inline error display (suppress global toast via `meta` or by not throwing)

This single change makes all silent mutation failures (logout, delete, sync) visible with zero per-component work.

### Extension (no change needed)

Extension queries already display errors inline. No mutations exist (sync will be removed from CaptionPanel). Shadow DOM makes toast portaling impractical. Keep as-is.

### Follow-up (separate from this task)

- Fix sync state bug: push/pull mutation errors not reflected in `state`
- Fix delete race condition: local data removed before server confirms
- Server ORPCError consistency: plain `Error` → `ORPCError("NOT_FOUND")`
- Root ErrorBoundary

## Status

- [x] Audit complete
- [ ] Sonner toast for web app
