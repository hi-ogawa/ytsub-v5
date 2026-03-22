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

## Solution: versioned writes with originator-only bump

Each key in chrome.storage stores a versioned envelope:

```ts
type Versioned<T> = { v: number; d: T };
// e.g. chrome.storage["zamak:video-index"] = { v: 5, d: [...entries] }
```

Each context tracks `lastVersion` per key. The invariant:

> **A context applies an `onChanged` event if and only if `v > lastVersion`.**

| Scenario              | What happens                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Boot**              | Read `{ v, d }` from chrome.storage -> set `lastVersion = v`, apply `d`                                                    |
| **Originating write** | Increment `lastVersion`, then `setLocal()` -> subscribe writes `{ v: lastVersion, d }`                                     |
| **Forwarding write**  | Adopt received `v` as `lastVersion`, then `setLocal()` -> subscribe writes `{ v: lastVersion, d }` (same version, no bump) |
| **Remote change**     | `onChanged` delivers `{ v, d }` with `v > lastVersion` -> apply (forwarding write)                                         |
| **Echo**              | `onChanged` delivers `{ v, d }` with `v <= lastVersion` -> skip                                                            |

The critical rule: **only the originating context bumps the version.** The subscribe callback always writes with the current `lastVersion` — it doesn't increment. When a forwarding context writes back the same version it received, all contexts already have that `lastVersion`, so the resulting `onChanged` events are skipped. This breaks the echo loop without guard flags or value comparison.

### Who bumps?

| Context  | Trigger                     | Bump? | Why                                                    |
| -------- | --------------------------- | ----- | ------------------------------------------------------ |
| Relay    | BroadcastChannel from MAIN  | Yes   | Proxy for MAIN world, which can't reach chrome.storage |
| Ext page | `set()` from UI interaction | Yes   | Direct originator                                      |
| Either   | `onChanged`                 | No    | Forwarding — adopt the received `v`                    |

### Redundant forwarding writes (acceptable)

When a context receives `onChanged(v=6)` and calls `setLocal()`, the subscribe callback writes `{v:6, d}` back to chrome.storage — a redundant write with identical version and data. This triggers another round of `onChanged` events in all contexts, but they all skip (`v <= lastVersion`). Harmless noise; not worth adding complexity to suppress.

### Race condition (acceptable)

Two tabs write simultaneously from the same base version -> both produce `v = N+1` -> last-write-wins in chrome.storage. The loser's `onChanged` has `v <= lastVersion`, so it's skipped — the loser won't see the winner's data until the next write from either side. This is self-healing and acceptable: the version exists for echo suppression, not conflict resolution.

### Migration

Existing chrome.storage values have bare data (no `{ v, d }` envelope). On boot, if `typeof value.v !== "number"`, treat as unversioned -> apply with `lastVersion = 0`. On next write, it gets wrapped in the envelope. Unversioned `onChanged` events (during transition) are skipped — boot hydration handles the migration path.

## Data flows (after `onChanged` + versioning)

### Double BroadcastChannel handling in relay

`videoIndexStore` creates its own `BroadcastChannel("zamak:store")` listener internally (in `createLocalStorageStore`), which calls `setLocal()` on matching messages. The relay creates a second BC instance to intercept the same messages for version bumping. Both fire for each MAIN world message — order is unspecified.

If the store's listener fires first: `setLocal()` → subscribe → `writeVersioned()` with the un-bumped version (e.g. v=5). Then the relay's listener bumps and calls `setLocal()` → subscribe → `writeVersioned()` with v=6. The v=5 write is harmless — other contexts skip it (`5 <= lastVersion`). The v=6 write is the one that propagates.

This is an acceptable trade-off: one extra chrome.storage write per BC message, but the store API stays unchanged (no special flag to disable the internal BC listener).

**Content script writes -> extension page sees it:**

```
MAIN: store.set() -> localStorage, BroadcastChannel post
Relay: store's internal BC listener -> setLocal() -> subscribe -> chrome.storage.set({v:5}) [harmless extra write]
Relay: explicit BC listener -> bump v to 6 -> setLocal() -> subscribe -> chrome.storage.set({v:6})
Relay: onChanged(v=6) -> 6 <= 6 -> skip ✓
Ext page: onChanged(v=6) -> 6 > lastVersion -> adopt lastVersion=6 -> setLocal() -> subscribe -> chrome.storage.set({v:6})
Ext page: onChanged(v=6) -> 6 <= 6 -> skip ✓
Relay: onChanged(v=6) -> 6 <= 6 -> skip ✓
```

**Extension page writes -> content script sees it:**

```
Ext page: bump v to 6 -> setLocal() -> subscribe -> chrome.storage.set({v:6})
Ext page: onChanged(v=6) -> 6 <= 6 -> skip ✓
Relay: onChanged(v=6) -> 6 > lastVersion -> adopt lastVersion=6 -> setLocal() -> BC post -> subscribe -> chrome.storage.set({v:6})
MAIN: BC listener -> setLocal() -> React re-render ✓
Relay: onChanged(v=6) -> 6 <= 6 -> skip ✓
Ext page: onChanged(v=6) -> 6 <= 6 -> skip ✓
```

**Cross-tab content scripts:**

```
Tab A MAIN: store.set() -> BroadcastChannel post
Tab B MAIN: BroadcastChannel listener -> setLocal() (direct, no chrome.storage)
Tab A Relay: store's internal BC listener -> setLocal() -> subscribe -> chrome.storage.set({v:5}) [harmless extra write]
Tab A Relay: explicit BC listener -> bump v to 6 -> setLocal() -> subscribe -> chrome.storage.set({v:6})
Tab B Relay: onChanged(v=6) -> 6 > lastVersion -> adopt lastVersion=6 -> setLocal() (redundant, Tab B already up to date) -> subscribe -> chrome.storage.set({v:6})
All: subsequent onChanged(v=6) -> skip ✓
```

## Implementation plan

### 1. Versioned chrome.storage helpers

```ts
type Versioned<T> = { v: number; d: T };

const versions = new Map<string, number>();

/** Bump version (call at origination points only). */
function bumpVersion(key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1);
}

/** Write with current lastVersion (called from subscribe — never increments). */
function writeVersioned(key: string, value: unknown): void {
  const v = versions.get(key) ?? 0;
  chrome.storage.local.set({ [key]: { v, d: value } });
}

/** Read boot value, adopting its version. */
function readVersionedBoot<T>(raw: unknown, key: string): T | undefined {
  const versioned = raw as Versioned<T> | undefined;
  if (versioned && typeof versioned.v === "number") {
    versions.set(key, versioned.v);
    return versioned.d;
  }
  // Migration: bare (unversioned) data — apply with lastVersion = 0
  if (raw !== undefined && raw !== null) return raw as T;
  return undefined;
}

/** Read onChanged value. Returns data if v > lastVersion, undefined to skip. */
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

### 2. Relay: bump on BroadcastChannel, add `onChanged` listener

```ts
// BroadcastChannel from MAIN — relay is proxy originator, so bump
channel.addEventListener("message", (e) => {
  if (e.data.key === key) {
    bumpVersion(key);
    store.setLocal(e.data.value); // -> subscribe -> writeVersioned (bumped v)
  }
});

// subscribe writes to chrome.storage with current version (no bump)
store.subscribe(() => {
  writeVersioned(store.key, store.get());
});

// onChanged — adopt version, no bump
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    const store = storesByKey.get(key);
    if (!store) continue;
    const data = readVersionedChange(key, change.newValue);
    if (data === undefined) continue;
    store.setLocal(data); // -> BC post to MAIN, subscribe -> writeVersioned (same v)
  }
});
```

### 3. Extension page: bump on `set()`, add `onChanged` listener

```ts
// Wrap set() to bump before setLocal
function originatingSet(value) {
  bumpVersion(store.key);
  store.setLocal(value); // -> subscribe -> writeVersioned (bumped v)
}

// subscribe writes to chrome.storage with current version (no bump)
store.subscribe(() => {
  writeVersioned(store.key, store.get());
});

// onChanged — adopt version, no bump
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const data = readVersionedChange(store.key, changes[store.key]?.newValue);
  if (data === undefined) return;
  store.setLocal(data); // -> subscribe -> writeVersioned (same v)
});
```

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
