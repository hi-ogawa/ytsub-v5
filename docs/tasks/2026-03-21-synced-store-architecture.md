# Synced Store Architecture

## Problem

Extension contexts run in separate JS environments with different storage access:

| Context                         | localStorage     | chrome.storage | DOM events             |
| ------------------------------- | ---------------- | -------------- | ---------------------- |
| Content script (MAIN world)     | youtube.com      | no             | yes (youtube.com)      |
| Content script (ISOLATED/relay) | youtube.com      | yes            | yes (youtube.com)      |
| Extension page (bookmarks.html) | extension origin | yes            | yes (extension origin) |
| Background service worker       | no               | yes            | no                     |

Certain stores (currently just `videoIndexStore`) need to stay in sync across all of these. The video index must be readable from both the content script (to show sync badges) and the extension page (to list bookmarked videos).

## Current state (after relay simplification)

Stores are `LocalStorageStore<T>` instances created by `createLocalStorageStore()` in `external-store.ts`. They hold an in-memory value, persist to localStorage on `.set()`, and dispatch a `STORE_UPDATED_EVENT` DOM event.

`synced-stores.ts` maintains a registry (`SYNCED_STORES`) of stores that need chrome.storage sync, and exposes two setup helpers:

### Write path (localStorage → chrome.storage) — works today

```
Content MAIN world
  store.set() → localStorage + STORE_UPDATED_EVENT
    → Relay (ISOLATED) listens for event → chrome.storage.local.set()

Extension page
  store.set() → localStorage + STORE_UPDATED_EVENT
    → hydrateSyncedStores subscriber → chrome.storage.local.set()
```

### Read path (chrome.storage → localStorage) — one-shot only

```
Extension page (on load)
  hydrateSyncedStores() → chrome.storage.local.get() → store.set()
```

No runtime read path exists. Changes to chrome.storage are never propagated back.

### What's missing

1. **Extension page → content script**: Extension page writes to chrome.storage, but the content script never learns about it.
2. **Content script → extension page**: Content script writes to chrome.storage via relay, but the extension page never learns about it (after initial hydration).
3. **Cross-tab content scripts**: If multiple YouTube tabs are open, a store change in one tab doesn't propagate to others.

## Target: full runtime sync via chrome.storage.onChanged

`chrome.storage.onChanged` fires in every extension context (relay, extension page, background) when any context writes to chrome.storage. This is the missing back-channel.

### Proposed architecture

```
                      chrome.storage (source of truth for cross-context sync)
                       ▲              │
            write      │              │ onChanged
                       │              ▼
  ┌────────────────────┼──────────────────────────────────┐
  │                    │                                  │
  │  Content MAIN      │  Relay (ISOLATED)                │
  │  store.set()       │  STORE_UPDATED_EVENT → cs.set()  │
  │    → localStorage  │  cs.onChanged → localStorage     │
  │    → DOM event ────┘    → inner.set() (no DOM event)  │
  │    ← localStorage  │      → React re-renders          │
  │       storage event │                                  │
  └────────────────────┼──────────────────────────────────┘
                       │
  ┌────────────────────┼──────────────────────────────────┐
  │  Extension page    │                                  │
  │  store.set()       │                                  │
  │    → localStorage  │                                  │
  │    → cs.set() ─────┘                                  │
  │  cs.onChanged → store.setLocal() → React re-renders   │
  └───────────────────────────────────────────────────────┘
```

### Loop prevention

The key problem: `store.set()` → chrome.storage → `onChanged` → `store.set()` → chrome.storage → ...

Solution: **two-tier set**

- `store.set(value)` — full set: updates in-memory + localStorage + dispatches `STORE_UPDATED_EVENT` (triggers chrome.storage write)
- `store.setLocal(value)` — quiet set: updates in-memory + localStorage only, notifies React subscribers, does NOT dispatch `STORE_UPDATED_EVENT` (no chrome.storage write-back)

The `onChanged` listener always calls `setLocal()`, breaking the loop.

### Implementation pieces

1. **`external-store.ts`**: Add `setLocal()` to `LocalStorageStore` — same as `set()` but skips `STORE_UPDATED_EVENT` dispatch.

2. **`synced-stores.ts`**: Add `listenForChromeStorageChanges()` helper — listens to `chrome.storage.onChanged`, calls `store.setLocal()` for matching keys.

3. **Relay (`relay.ts`)**: Call `listenForChromeStorageChanges()` — when chrome.storage changes (from extension page), update localStorage so MAIN world picks it up. MAIN world detects the change via the browser's native `storage` event (fires for same-origin localStorage changes made by another context sharing that origin — the relay shares youtube.com origin with MAIN world).

4. **Extension page (`bookmarks.tsx`)**: Call `listenForChromeStorageChanges()` — when chrome.storage changes (from content script relay), update in-memory store + localStorage.

5. **Background**: No change needed unless it starts consuming these stores.

### Data flow for each scenario

**Content script edits → extension page sees it:**

```
MAIN: store.set() → localStorage → STORE_UPDATED_EVENT
ISOLATED: event listener → chrome.storage.local.set()
Extension page: chrome.storage.onChanged → store.setLocal() → React re-render
```

**Extension page edits → content script sees it:**

```
Extension page: store.set() → localStorage → chrome.storage.local.set()
ISOLATED: chrome.storage.onChanged → localStorage.setItem()
MAIN: browser `storage` event → store re-reads from localStorage → React re-render
```

**Cross-tab content scripts:**

```
Tab A MAIN: store.set() → localStorage → STORE_UPDATED_EVENT
Tab A ISOLATED: event listener → chrome.storage.local.set()
Tab B ISOLATED: chrome.storage.onChanged → localStorage.setItem()
Tab B MAIN: browser `storage` event → re-read
```

## Reference files

- `src/lib/external-store.ts` — `ExternalStore`, `LocalStorageStore`, `createLocalStorageStore`
- `src/lib/synced-stores.ts` — `SYNCED_STORES` registry, `setupSyncedStoreRelay`, `hydrateSyncedStores`
- `src/lib/video-index.ts` — `videoIndexStore` (the only synced store currently)
- `src/extension/relay.ts` — ISOLATED world content script
- `src/extension/bookmarks.tsx` — extension page
- `src/extension/background.ts` — background service worker

## Non-synced localStorage stores

`autoScrollStore` and `fabOpenStore` in `caption-panel.tsx` are local-only UI preferences. They don't need chrome.storage sync — they're per-origin settings that only matter in the context where they're used.

## Status

- [x] Simplified relay to write chrome.storage directly (removed bgRpc round-trip)
- [x] Moved `videoIndexStore` to `video-index.ts`
- [x] Added `storageKey` to `LocalStorageStore`
- [x] Add `setLocal()` to `LocalStorageStore`
- [x] Two-way sync in relay (`setupSyncedStoreRelay`) with `chrome.storage.onChanged`
- [x] Two-way sync in extension page (`setupSyncedStoresForExtensionPage`) with `chrome.storage.onChanged`
- [x] MAIN world: `createLocalStorageStore` listens for `STORE_UPDATED_EVENT` from other contexts and re-reads localStorage
- [x] Loop prevention via guard flags in relay, extension page, and store
