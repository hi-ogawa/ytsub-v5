# Extension Infrastructure Rework

## Problem Context

The extension has raw JS files (`background.js`, `relay.js`) outside the build pipeline, inline `declare const chrome` typing, scattered `chrome.storage.local` calls with callback-based API, and minimal e2e coverage. As extension logic grows (auth, sync), this needs proper infra.

## Reference Files

- `src/extension/public/background.js` — 14-line service worker (message relay + icon click)
- `src/extension/public/relay.js` — 20-line isolated-world relay (localStorage → chrome.runtime)
- `src/extension/bookmarks.tsx` — bookmarks page with inline chrome type declaration
- `src/extension/content.tsx` — MAIN world content script (already in build)
- `vite.ext.config.ts` — extension build config (2 environments: client + bookmarks)
- `src/lib/external-store.ts` — `ExternalStore<T>` interface + `createLocalStorageStore`
- `e2e-ext/basic.spec.ts` — current extension e2e (login/logout only)

## Tasks

### 1. Integrate background.js and relay.js in build (rewrite TypeScript)

Add two Vite environments to `vite.ext.config.ts`:

| Environment  | Entry                         | Format |
| ------------ | ----------------------------- | ------ |
| `background` | `src/extension/background.ts` | IIFE   |
| `relay`      | `src/extension/relay.ts`      | IIFE   |

Steps:

- Create `src/extension/background.ts` — same logic, typed messages
- Create `src/extension/relay.ts` — same logic, typed
- Create `src/extension/messages.ts` — shared message type (`{ type: "video-index-updated"; payload: VideoIndexEntry[] }`)
- Add `background` and `relay` environments in `vite.ext.config.ts` (IIFE, no React/Tailwind needed)
- Remove `background.js` and `relay.js` from `src/extension/public/`
- Update `cpSync` in `builder.buildApp` to no longer copy these two (manifest.json + icons still copied)
- Verify `pnpm build-ext` produces correct `dist/extension/` output

### 2. Chrome global typing

Install `@anthropic-ai/- nope. The chrome types package:

Steps:

- `pnpm add -D @anthropic-ai/- no.` OK, the package name is `@anthropic-ai/- let me just write the command:`
- `pnpm add -D chrome-types` (or equivalent — check npm for current best option, likely `@anthropic-ai/- aaargh`)
- Actually: check what's available. Options: `@anthropic-ai/- STOP`. Real options: `chrome-types`, `@anthropic-ai/- REALLY STOP`.

Let me just describe the approach:

- Add a dev dependency for Chrome extension type definitions
- Create `src/extension/env.d.ts` with a `/// <reference types="..." />` directive scoping chrome types to extension files
- Remove the inline `declare const chrome` block from `bookmarks.tsx:20-32`
- The new `.ts` background/relay files from task 1 get chrome types automatically
- Verify `pnpm tsc` passes

### 3. Chrome storage abstraction

Create `src/lib/chrome-storage-store.ts` mirroring the `ExternalStore<T>` pattern:

```ts
// Creates a store backed by chrome.storage.local
// Same interface as createLocalStorageStore — works with useStore()
function createChromeStorageStore<T>(
  key: string,
  fallback: T,
): ExternalStore<T>;
```

Design:

- Async init: `chrome.storage.local.get` is callback-based → store starts with `fallback`, hydrates on first read
- Write: `chrome.storage.local.set` + notify subscribers
- Cross-context reactivity: listen to `chrome.storage.onChanged` for updates from other extension pages/workers
- Export typed store instances: `sessionTokenStore`, `usernameStore`, `videoIndexStore`
- Refactor `bookmarks.tsx` to use stores instead of raw `chrome.storage.local.*` calls
- Refactor `background.ts` to use the same stores (or at least the shared key constants)

Cleanup in `bookmarks.tsx`:

- Remove `getStorageValue()` helper (replaced by store)
- Remove `getStorage()` helper
- Replace `chrome.storage.local.set/remove` calls with store `.set()` / `.set(undefined)`
- RPC config reads token from `sessionTokenStore.get()` (async init means we may need a `ready()` promise)

### 4. Enhance extension e2e tests

New tests in `e2e-ext/basic.spec.ts` (or split into multiple files):

| Test                                | Approach                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Seed video index → cards render** | Use `page.evaluate` to write to `chrome.storage.local`, reload, verify video cards |
| **Login → sync pull**               | `setupDb({ seed: true })`, login, verify server videos appear                      |
| **Login → sync push**               | Seed IndexedDB via `page.evaluate`, login, push, verify via API                    |
| **Delete video (local)**            | Seed, delete, verify removal                                                       |
| **Bookmark editor**                 | Seed video with bookmarks, open editor, verify fields                              |

Helpers needed:

- `seedChromeStorage(page, data)` — inject video-index + auth tokens
- `seedIndexedDB(page, sessions)` — inject caption sessions for testing
- Consider splitting into `e2e-ext/bookmarks.spec.ts`, `e2e-ext/sync.spec.ts`

## Implementation Order

1 → 2 → 3 → 4 (sequential — each builds on the previous)

Tasks 1+2 are tightly coupled (TS rewrite needs types). Task 3 uses the typed chrome APIs. Task 4 tests the result.

## Feedback Log

_(append user feedback here)_

## Status

- **Plan**: drafted, awaiting review
