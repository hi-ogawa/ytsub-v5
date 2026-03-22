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

## Model: replicated state with versioned source of truth

This is a distributed system with one source of truth (chrome.storage) and multiple replicas (each page's in-memory store). Pages come and go — there's no guarantee any particular page is open. The design must handle:

- **Boot**: replica reads current state from source of truth
- **Local write**: replica writes locally, propagates to source of truth
- **Remote change**: source of truth changes, replicas apply it
- **Self-echo**: after a local write, the source of truth fires `onChanged` back to the writer — must not cause redundant work or loops

### Versioned writes (echo suppression by construction)

Each key in chrome.storage stores a versioned envelope:

```ts
type Versioned<T> = { v: number; d: T };
// e.g. chrome.storage["zamak:video-index"] = { v: 5, d: [...entries] }
```

Each replica tracks `lastVersion` per key. The invariant:

> **A replica applies a change if and only if `v > lastVersion`.**

This single rule handles all cases:

| Scenario          | What happens                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ |
| **Boot**          | Read `{ v, d }` from chrome.storage → set `lastVersion = v`, apply `d`               |
| **Local write**   | Increment `lastVersion`, write `{ v: lastVersion, d }` to chrome.storage             |
| **Remote change** | `onChanged` delivers `{ v, d }` with `v > lastVersion` → apply, update `lastVersion` |
| **Self-echo**     | `onChanged` delivers `{ v, d }` with `v <= lastVersion` → skip                       |
| **Stale echo**    | `onChanged` delivers older version (e.g. from slow tab) → `v <= lastVersion` → skip  |

No guard flags, no value comparison. The version number is the only mechanism.

### Race condition (acceptable)

Two tabs write simultaneously from the same base version → both produce `v = N+1` → last-write-wins in chrome.storage. This is fine: the version exists for echo suppression, not conflict resolution. Both tabs end up with the same final state via `onChanged`.

## Architecture

### Layers

```
┌───────────────────────────────────────────────────────────┐
│  chrome.storage         (source of truth, versioned)      │
│  { "zamak:video-index": { v: 5, d: [...] } }              │
└─────────────┬─────────────────────────────┬───────────────┘
         ▲    │ onChanged                ▲  │ onChanged
  write  │    ▼                   write  │  ▼
┌────────┴────────────────┐   ┌──────────┴────────────────────┐
│  Relay (ISOLATED)       │   │  Extension page               │
│                         │   │                               │
│  MAIN event             │   │  store.set() → write({ v,d }) │
│   → read localStorage   │   │  onChanged (v>last) → setLocal│
│   → write({ v, d })     │   │  onChanged (v≤last) → skip    │
│  onChanged (v>last)     │   └───────────────────────────────┘
│   → localStorage.set    │
│   → STORE_UPDATED_EVENT │
│  onChanged (v≤last)     │
│   → skip                │
└────────┬────────────────┘
    ▲    │ DOM events + localStorage
    │    ▼
┌───┴─────────────────────┐
│  Content (MAIN world)   │
│                         │
│  store.set()            │
│   → localStorage.set    │
│   → STORE_UPDATED_EVENT │
│  on external event      │
│   → re-read localStorage│
│  no chrome.storage      │
└─────────────────────────┘
```

### MAIN ↔ Relay bridge

MAIN world has no chrome.storage access. The relay bridges using shared localStorage (same youtube.com origin) and DOM events (same page, cross-world):

- **MAIN → relay**: `store.set()` writes localStorage + dispatches `STORE_UPDATED_EVENT` → relay listens, writes versioned value to chrome.storage
- **Relay → MAIN**: relay writes localStorage + dispatches `STORE_UPDATED_EVENT` → store listens (skips self-dispatched events via `selfWrite` flag), re-reads from localStorage

The `selfWrite` flag in the store is the one remaining non-version guard — it's scoped to same-page, same-world event dispatch (synchronous), not cross-context chrome.storage. It distinguishes "I dispatched this DOM event" from "the relay dispatched it", which the version stamp can't do since both share the same localStorage.

### Data flows

**Content script writes → extension page sees it:**

```
MAIN: store.set() → localStorage, STORE_UPDATED_EVENT
Relay: event → read localStorage → lastVersion++, chrome.storage.set({ v, d })
Relay: onChanged fires → v <= lastVersion → skip (self-echo)
Ext page: onChanged fires → v > lastVersion → apply, update lastVersion
```

**Extension page writes → content script sees it:**

```
Ext page: store.set() → lastVersion++, chrome.storage.set({ v, d })
Ext page: onChanged fires → v <= lastVersion → skip (self-echo)
Relay: onChanged fires → v > lastVersion → localStorage.setItem, STORE_UPDATED_EVENT
MAIN: event listener → re-reads localStorage → React re-render
```

**Cross-tab content scripts:**

```
Tab A MAIN: store.set() → localStorage, STORE_UPDATED_EVENT
Tab A Relay: event → lastVersion++, chrome.storage.set({ v, d })
Tab A Relay: onChanged → v <= lastVersion → skip
Tab B Relay: onChanged → v > lastVersion → localStorage, STORE_UPDATED_EVENT
Tab B MAIN: event listener → re-reads localStorage
```

**Boot (any context with chrome.storage):**

```
Read chrome.storage.get(key) → { v, d }
Set lastVersion = v
Apply d to local store
```

## Implementation plan

### 1. Version tracking in `synced-stores.ts`

```ts
type Versioned<T> = { v: number; d: T };

// Per-key version tracking shared across setup functions
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
  if (versioned.v <= (versions.get(key) ?? 0)) return undefined; // echo or stale
  versions.set(key, versioned.v);
  return versioned.d;
}
```

### 2. `setupSyncedStoreRelay()` — simplified

```ts
export function setupSyncedStoreRelay() {
  // Boot: hydrate localStorage from chrome.storage
  for (const store of SYNCED_STORES) {
    /* read + apply */
  }

  // MAIN → chrome.storage (via DOM event bridge)
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    const store = storesByKey.get(key);
    if (store) writeToChromeStorage(key, store.get()); // version++ prevents echo
  });

  // chrome.storage → localStorage → MAIN (via DOM event bridge)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (!storesByKey.has(key)) continue;
      const data = readVersionedChange(key, change.newValue); // returns undefined if echo
      if (data === undefined) continue;
      localStorage.setItem(key, JSON.stringify(data));
      window.dispatchEvent(
        new CustomEvent(STORE_UPDATED_EVENT, { detail: key }),
      );
    }
  });
}
```

### 3. `setupSyncedStoresForExtensionPage()` — simplified

```ts
export async function setupSyncedStoresForExtensionPage() {
  // Boot: chrome.storage → store
  for (const store of SYNCED_STORES) {
    /* read versioned + setLocal */
  }

  // store changes → chrome.storage
  for (const store of SYNCED_STORES) {
    store.subscribe(() => writeToChromeStorage(store.storageKey, store.get()));
  }

  // chrome.storage → store (version check skips self-echo)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      const store = storesByKey.get(key);
      if (!store) continue;
      const data = readVersionedChange(key, change.newValue);
      if (data === undefined) continue;
      store.setLocal(data as never);
    }
  });
}
```

### 4. `store.setLocal()` and `selfWrite` flag — unchanged

`setLocal()` remains for the extension page's `onChanged` → store path (skip `STORE_UPDATED_EVENT`). The `selfWrite` flag in `createLocalStorageStore` stays — it handles the same-page DOM event echo between store and relay, which versions don't cover.

### 5. Migration

Existing chrome.storage values have bare data (no `{ v, d }` envelope). `readVersionedChange` handles this: if `typeof versioned.v !== "number"`, treat as unversioned → apply with version 0. On next write, it gets wrapped in the envelope.

## Reference files

- `src/lib/external-store.ts` — `ExternalStore`, `LocalStorageStore`, `createLocalStorageStore`
- `src/lib/synced-stores.ts` — `SYNCED_STORES` registry, `setupSyncedStoreRelay`, `setupSyncedStoresForExtensionPage`
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
- [x] Boot hydration in relay: chrome.storage → localStorage before MAIN world inits
- [x] Relay and bookmarks page use same pattern: `setLocal` for hydration, `subscribe` for sync-back

### Current sync coverage

**Same-origin localStorage** — fully synced (reactive):

BroadcastChannel delivers across tabs on the same origin. Two YouTube tabs (or two extension pages) reactively sync in-memory store state without chrome.storage involved.

**youtube localStorage ↔ chrome.storage ↔ extension localStorage** — boot only:

Both relay and bookmarks page read chrome.storage on boot and hydrate their localStorage via `setLocal`. Fresh data is available when the page loads.

**youtube localStorage → chrome.storage ← extension localStorage** — always-on write:

Both sides write to chrome.storage on every store change via `subscribe` callbacks. Changes propagate to chrome.storage immediately.

**chrome.storage → youtube localStorage / extension localStorage** — NOT yet live:

Missing `chrome.storage.onChanged` listeners. If the extension page writes, an already-open YouTube tab won't see the change until reload (and vice versa). This is the remaining gap for full always-on two-way sync.

### Remaining

- [ ] `chrome.storage.onChanged` listener in relay (chrome.storage → youtube localStorage, live)
- [ ] `chrome.storage.onChanged` listener in bookmarks page (chrome.storage → extension localStorage, live)
- [ ] Versioned writes for echo suppression (needed once `onChanged` listeners exist)
- [ ] Generic synced store registry (for adding `zamak:ai-prompt` etc.)
