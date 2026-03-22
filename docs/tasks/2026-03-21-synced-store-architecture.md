# Synced Store Architecture

## Current state (PR #154)

Extension stores (currently `videoIndexStore`) need to stay in sync across contexts with different storage access:

| Context                         | localStorage     | chrome.storage |
| ------------------------------- | ---------------- | -------------- |
| Content script (MAIN world)     | youtube.com      | no             |
| Content script (ISOLATED/relay) | youtube.com      | yes            |
| Extension page (bookmarks.html) | extension origin | yes            |
| Background service worker       | no               | yes            |

Each `LocalStorageStore` owns a `BroadcastChannel("zamak:store")` instance. `set()` writes to localStorage and broadcasts `{ key, value }`. `setLocal()` writes to localStorage without broadcasting (for receiving external updates). BroadcastChannel delivers to all other instances with the same name except the sender — no self-echo.

### What's synced today

**Same-origin localStorage — fully reactive:**

BroadcastChannel delivers across tabs on the same origin. Two YouTube tabs (or two extension pages) reactively sync in-memory store state. `set()` -> broadcast -> other tab's listener -> `setLocal()` -> React re-renders. No chrome.storage involved.

**youtube localStorage <-> chrome.storage <-> extension localStorage — boot only:**

Both relay and bookmarks page read chrome.storage on boot and hydrate their store via `setLocal()`. ISOLATED relay boots before MAIN world, so localStorage is fresh when MAIN's store calls `readFromStorage()`.

**youtube localStorage -> chrome.storage <- extension localStorage — always-on write:**

Both relay and bookmarks page call `store.subscribe()` to write to chrome.storage on every change. On the YouTube side, MAIN's `set()` broadcasts -> relay's store receives via BroadcastChannel -> `setLocal()` -> subscriber fires -> writes chrome.storage.

### What's missing

**chrome.storage -> youtube localStorage / extension localStorage — NOT live:**

No `chrome.storage.onChanged` listeners yet. If the extension page writes, an already-open YouTube tab won't see the change until reload (and vice versa). This is the remaining gap for full always-on two-way sync.

## Problem: adding `onChanged` creates echo loops

Once we add `chrome.storage.onChanged` listeners, a write cycle appears:

```
store.set() -> subscribe -> chrome.storage.set()
           -> onChanged fires back -> store.setLocal() -> subscribe -> chrome.storage.set() -> ...
```

The `subscribe` callback can't distinguish "I triggered this change" from "an external source triggered it." We need echo suppression.

## Solution: versioned writes

Each key in chrome.storage stores a versioned envelope:

```ts
type Versioned<T> = { v: number; d: T };
// e.g. chrome.storage["zamak:video-index"] = { v: 5, d: [...entries] }
```

Each context tracks `lastVersion` per key. The invariant:

> **A context applies an `onChanged` event if and only if `v > lastVersion`.**

| Scenario          | What happens                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Boot**          | Read `{ v, d }` from chrome.storage -> set `lastVersion = v`, apply `d`               |
| **Local write**   | Increment `lastVersion`, write `{ v: lastVersion, d }` to chrome.storage              |
| **Remote change** | `onChanged` delivers `{ v, d }` with `v > lastVersion` -> apply, update `lastVersion` |
| **Self-echo**     | `onChanged` delivers `{ v, d }` with `v <= lastVersion` -> skip                       |

No guard flags, no value comparison. The version number is the only mechanism.

### Race condition (acceptable)

Two tabs write simultaneously from the same base version -> both produce `v = N+1` -> last-write-wins in chrome.storage. This is fine: the version exists for echo suppression, not conflict resolution. Both tabs end up with the same final state via `onChanged`.

### Migration

Existing chrome.storage values have bare data (no `{ v, d }` envelope). On boot, if `typeof value.v !== "number"`, treat as unversioned -> apply with `lastVersion = 0`. On next write, it gets wrapped in the envelope.

## Data flows (after `onChanged` + versioning)

**Content script writes -> extension page sees it:**

```
MAIN: store.set() -> localStorage, BroadcastChannel post
Relay: BroadcastChannel listener -> setLocal() -> subscribe -> versioned chrome.storage.set()
Relay: onChanged fires -> v <= lastVersion -> skip (self-echo)
Ext page: onChanged fires -> v > lastVersion -> setLocal()
```

**Extension page writes -> content script sees it:**

```
Ext page: store.set() -> subscribe -> versioned chrome.storage.set()
Ext page: onChanged fires -> v <= lastVersion -> skip (self-echo)
Relay: onChanged fires -> v > lastVersion -> store.setLocal() -> BroadcastChannel post
MAIN: BroadcastChannel listener -> setLocal() -> React re-render
```

**Cross-tab content scripts:**

```
Tab A MAIN: store.set() -> BroadcastChannel post
Tab B MAIN: BroadcastChannel listener -> setLocal() (direct, no chrome.storage)
Tab A Relay: BroadcastChannel listener -> setLocal() -> subscribe -> chrome.storage.set()
Tab B Relay: onChanged -> v > lastVersion -> setLocal() (redundant, Tab B already up to date)
```

## Implementation plan

### 1. Versioned chrome.storage helpers

```ts
type Versioned<T> = { v: number; d: T };

const versions = new Map<string, number>();

function writeToChromeStorage(key: string, value: unknown) {
  const v = (versions.get(key) ?? 0) + 1;
  versions.set(key, v);
  chrome.storage.local.set({ [key]: { v, d: value } });
}

function readVersionedChange(
  key: string,
  newValue: unknown,
): unknown | undefined {
  const versioned = newValue as Versioned<unknown> | undefined;
  if (!versioned || typeof versioned.v !== "number") return undefined;
  if (versioned.v <= (versions.get(key) ?? 0)) return undefined;
  versions.set(key, versioned.v);
  return versioned.d;
}
```

### 2. Relay: add `onChanged` listener

```ts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    const store = storesByKey.get(key);
    if (!store) continue;
    const data = readVersionedChange(key, change.newValue);
    if (data === undefined) continue;
    store.setLocal(data); // BroadcastChannel post reaches MAIN
  }
});
```

### 3. Extension page: add `onChanged` listener

Same pattern — `readVersionedChange` skips self-echo, applies remote changes via `setLocal`.

## Reference files

- `src/lib/external-store.ts` — `ExternalStore`, `LocalStorageStore`, `createLocalStorageStore`
- `src/lib/video-index.ts` — `videoIndexStore` (the only synced store currently)
- `src/extension/relay.ts` — ISOLATED world content script
- `src/extension/bookmarks.tsx` — extension page
- `src/extension/background.ts` — background service worker

## Non-synced localStorage stores

`autoScrollStore` and `fabOpenStore` in `caption-panel.tsx` are local-only UI preferences. They don't need chrome.storage sync — they're per-origin settings that only matter in the context where they're used.

## Status

### Done (PR #154)

- [x] Replaced window `dispatchEvent`/`addEventListener` with `BroadcastChannel("zamak:store")`
- [x] Each `LocalStorageStore` owns its own BroadcastChannel instance
- [x] Added `storageKey` and `setLocal()` to `LocalStorageStore`
- [x] Relay writes chrome.storage directly (removed `bgRpc.videoIndexUpdated` round-trip)
- [x] Boot hydration in relay: chrome.storage -> localStorage before MAIN world inits
- [x] Relay and bookmarks page use same pattern: `setLocal` for hydration, `subscribe` for sync-back

### Remaining

- [ ] `chrome.storage.onChanged` listener in relay (chrome.storage -> youtube localStorage, live)
- [ ] `chrome.storage.onChanged` listener in bookmarks page (chrome.storage -> extension localStorage, live)
- [ ] Versioned writes for echo suppression (needed once `onChanged` listeners exist)
- [ ] Generic synced store registry (for adding `zamak:ai-prompt` etc.)
