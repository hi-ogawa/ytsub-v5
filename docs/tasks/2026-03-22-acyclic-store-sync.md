# Acyclic Store Sync

Supersedes the versioned-envelope approach in `2026-03-21-synced-store-architecture.md`.

## Problem history

Extension stores (e.g. `videoIndexStore`) need to stay in sync across contexts that span different origins (youtube.com, chrome-extension://). The first attempt used `chrome.storage.onChanged` as the cross-origin notification channel, with a versioned envelope for echo suppression. This led to increasingly complex solutions (version counters, origin-only bumps, guard flags) that were all compensating for a fundamental design issue.

## Key insight: why same-origin sync just works

Within a single origin, BroadcastChannel provides two properties:

1. **Broadcast** — all instances on the same origin receive the message
2. **No self-delivery** — the sender never receives its own message

Together these make data flow inherently acyclic. A node reacts to a message, writes to storage, and the sender never sees its own write echoed back. No version counters, no guard flags, no origin tagging. It just works.

## Why cross-origin sync was hard

We were using `chrome.storage.onChanged` as the cross-origin notification channel. It provides broadcast but **not** no-self-delivery — the writer receives its own `onChanged` event. This introduced echo loops, and every solution attempt was a way to patch that missing property:

| Attempt              | Mechanism                                | Problem                                                                  |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Versioned envelope   | Counter per key, skip `v <= lastVersion` | Version increment in subscribe creates amplification across contexts     |
| Originator-only bump | Only originator increments version       | Double BC handling in relay, complexity in tracking who bumps            |
| Origin tagging       | `{ from: instanceId }`, skip self        | Cross-echo: A writes → C receives and writes back → A receives C's write |
| Guard flag           | `applyingRemote` flag around `setLocal`  | Patches the symptom, doesn't address the design                          |

All of these were workarounds for using the wrong notification primitive. The right question was never "how do we suppress echoes" — it was **"why don't we have echoes within a single origin, and how do we get the same property across origins?"**

## The correct generalization: extension-wide BroadcastChannel

The answer is direct: we need the same primitive that makes same-origin sync work, but across origins. An **extension-wide BroadcastChannel** with the same two properties:

1. **Broadcast** — all extension contexts (content scripts, extension pages) receive the message
2. **No self-delivery** — the sender doesn't receive its own message

This cannot not solve the problem, because it's the same primitive that already solves it within a single origin.

### Implementation: BG as hub

The browser doesn't provide a cross-origin BroadcastChannel, but the extension's background service worker is already connected to all contexts. It's the natural hub:

```
Content tabs ←(tab RPC)→ BG ←(??? new)→ Ext pages
                          ↑
                    hub / router
```

Each context sends messages to BG. BG broadcasts to all other contexts (not back to sender). The `from` field identifies the sender so BG can exclude them — same mechanism BC uses internally, just explicit.

### Abstraction

```ts
// Extension-wide BroadcastChannel — same API as BroadcastChannel
// but works across origins via BG as hub
type ExtBroadcastChannel = {
  postMessage(data: unknown): void;
  addEventListener(
    type: "message",
    listener: (e: { data: unknown }) => void,
  ): void;
};
```

Each context creates an instance. `postMessage` sends to BG. BG fans out to all other connected contexts. The sender never receives its own message — BG filters by sender identity.

## Architecture

### Layers

```
┌─────────────────────────────────────────────┐
│  Store sync                                 │  videoIndexStore, future stores
│  set() → postMessage, onMessage → setLocal  │
├─────────────────────────────────────────────┤
│  ExtBroadcastChannel                        │  broadcast + no self-delivery
│  postMessage / addEventListener("message")  │  across all extension contexts
├─────────────────────────────────────────────┤
│  RPC transport                              │  content ↔ bg ↔ ext
│  typed proxy, chrome.runtime / tabs         │  existing infra (+ BG→ext gap)
└─────────────────────────────────────────────┘
```

### Notification channels (complete picture)

| Scope                  | Channel                      | Self-delivery?       |
| ---------------------- | ---------------------------- | -------------------- |
| Same origin (YT tabs)  | BroadcastChannel             | No                   |
| Same origin (ext tabs) | BroadcastChannel             | No                   |
| Cross origin           | ExtBroadcastChannel (via BG) | No (by construction) |

All three channels have the same no-self-delivery property. Store sync code doesn't need to know which one it's using — they all behave the same way.

### Persistence (orthogonal)

chrome.storage is persistence only — read on boot, write on any change (via subscribe). Not a notification channel. This is a clean separation of concerns:

- **Notification**: BC (same-origin) + ExtBroadcastChannel (cross-origin)
- **Persistence**: chrome.storage (boot hydration + write-through)

Every context's subscribe callback unconditionally writes to chrome.storage on any store change (both `set()` and `setLocal()`). This means when the ext page writes, two chrome.storage writes happen: one from the ext page's subscribe (`ext → chrome`), and one from the relay's subscribe after receiving the ExtBC message (`ext → extBC → relay setLocal → chrome`). The redundant write is harmless — same data, and no one is listening to `onChanged`.

## RPC framework: current state and gap

| Direction    | Mechanism                                                          | Exists? |
| ------------ | ------------------------------------------------------------------ | ------- |
| Content → BG | MAIN → BC → relay → `runtime.sendMessage` → BG handler             | Yes     |
| BG → Content | `createContentRpc(tabId)` → `tabs.sendMessage` → relay → BC → MAIN | Yes     |
| Ext → BG     | `createRuntimeRpc` → `runtime.sendMessage` → BG handler            | Yes     |
| **BG → Ext** | ?                                                                  | **No**  |

The one infra gap is **BG → Ext page**. Same shape as `createContentRpc(tabId)` but targeting extension pages. Options:

- `chrome.runtime.connect` (long-lived port) — ext page connects on load, BG tracks port, sends messages on it
- `chrome.runtime.sendMessage` from BG — reaches extension pages, but is broadcast (all ext pages receive, which is actually what we want)

Within each origin, only one tab needs to receive the message — BC propagates to the rest. So BG can pick any one connected content tab and any one connected ext page.

## Data flows

### Content writes → ext sees it

```
MAIN: set() → localStorage + BC(yt) post
  → ExtBroadcastChannel.postMessage({ key, value })
    → relay forwards to BG
BG: fans out to ext pages (not back to sender)
Ext page: onMessage → setBroadcast() → localStorage + BC(ext) post to other ext tabs
```

### Ext writes → content sees it

```
Ext: set() → localStorage + BC(ext) post
  → ExtBroadcastChannel.postMessage({ key, value })
    → sends to BG
BG: fans out to content tabs (not back to sender)
Relay: onMessage → setBroadcast() → localStorage + BC(yt) post → MAIN + other tabs
```

### Boot (unchanged)

Any context reads chrome.storage on startup to hydrate store. Persistence path — no notifications.

## Store API (both approaches converge here)

Three levels of set, matching the two broadcast scopes:

```ts
setLocal(); // in-memory + localStorage
setBroadcast(); // setLocal + BC (same-origin)
set(); // setBroadcast + ExtBC/RPC (same-origin + cross-origin)
```

- **BC listener** → `setLocal()` (sender already broadcast to same-origin)
- **ExtBC/RPC handler** → `setBroadcast()` (cross-origin done, propagate within same-origin)
- **Everything else** → `set()` (full broadcast)

Persistence is orthogonal — subscribe writes to chrome.storage on any store change regardless of which set method was used.

## Reference files

- `src/lib/external-store.ts` — `LocalStorageStore`, `createLocalStorageStore`
- `src/lib/video-index.ts` — `videoIndexStore`
- `src/extension/relay.ts` — ISOLATED world content script
- `src/extension/bookmarks.tsx` — extension page
- `src/extension/background.ts` — background service worker, `bgRpcHandlers`
- `src/extension/content.tsx` — MAIN world, `tabRpcHandlers`
- `src/extension/lib/content-ports.ts` — content tab tracking
- `src/extension/lib/extension-rpc.ts` — typed RPC framework

## Implementation approaches

### Approach A: manual RPC wiring (incremental)

Add `storeUpdated` RPC handler + a new store method `setBroadcast()` for same-origin-only propagation.

**Store API — three levels of set**:

```ts
setLocal(); // in-memory + localStorage (no broadcast)
setBroadcast(); // setLocal + BC post (same-origin broadcast)  ← NEW
set(); // setBroadcast + bgRpc.storeUpdated (same-origin + cross-origin)
```

`setBroadcast()` propagates within the same origin only. `set()` does the full thing — same-origin BC + cross-origin via BG. `setLocal()` is for receiving same-origin BC updates (already exists).

**RPC payload**:

```ts
type StoreUpdatedParams = {
  from: "content" | "ext";
  key: string;
  value: unknown;
};
```

**BG handler** — routes to the opposite side:

```ts
async storeUpdated({ from, key, value }: StoreUpdatedParams) {
  if (from === "content") {
    extRpc.storeUpdated({ from, key, value });   // → ext page
  } else {
    contentRpc.storeUpdated({ from, key, value }); // → content tab
  }
}
```

**Content/ext tab handler** — receives cross-origin update, propagates within own origin:

```ts
async storeUpdated({ key, value }: StoreUpdatedParams) {
  storesByKey.get(key)?.setBroadcast(value); // setLocal + BC → other same-origin tabs
}
```

**No cycles**: `set()` → BG → opposite side → `setBroadcast()` → same-origin BC only, stops.

`set()` needs to know its `from` value and have access to `bgRpc` — the store becomes aware of the cross-origin broadcast layer. This is where approach A converges to approach B.

**Pros**: clean API (`set` vs `setBroadcast` vs `setLocal`), no manual wiring at call sites.
**Cons**: store needs per-context configuration (from, bgRpc reference), BG→ext path still needed.

### Approach B: ExtBroadcastChannel abstraction (clean generalization)

Wrap the RPC transport in a BroadcastChannel-like API. `set()` posts to ExtBC internally; the handler calls `setBroadcast()`.

```ts
const extChannel = createExtBroadcastChannel("zamak:store");

// set() internally does: setBroadcast() + extChannel.postMessage({ key, value })

extChannel.addEventListener("message", (e) => {
  const { key, value } = e.data;
  storesByKey.get(key)?.setBroadcast(value); // same-origin propagation
});
```

BG hub handles routing and sender exclusion internally. The store is configured with an ExtBC channel — same shape as the internal BC, just cross-origin.

**Pros**: clean abstraction, no-self-delivery built in, store sync code is identical across contexts.
**Cons**: more upfront work, BG→ext path still needed.

### Shared prerequisite: BG → Ext RPC path

Both approaches need this. Options:

- `chrome.runtime.connect` (long-lived port) — ext page connects on load, BG tracks port
- `chrome.runtime.sendMessage` from BG — reaches all extension pages (broadcast semantics, which is what we want)

## Decision: Approach A

Start with approach A (manual RPC wiring). Only `videoIndexStore` needs cross-origin sync — the other `createLocalStorageStore` users (`autoScrollStore`, `fabOpenStore` in `caption-panel.tsx`) are UI-only and don't need it. Refactor to approach B when adding a second cross-origin synced store.

## Decision: BG → Ext via long-lived ports

Use `chrome.runtime.connect` (long-lived ports) — ext page connects on load, BG tracks port. This mirrors the content tab pattern (`content-ports.ts`) and gives BG a uniform view of all connected contexts (content tabs + ext pages). This is the foundation for the hub/router pattern — BG needs to know its spokes to fan out messages selectively.

## `set()` wiring: callback, not store-internal bgRpc

The store shouldn't know about extension RPC. Add an optional `onSet?: (key: string, value: T) => void` callback to `createLocalStorageStore`. The extension layer hooks it to send the cross-origin RPC; the web app doesn't set it. This keeps the store transport-agnostic.

Call sites in `video-index.ts` (`updateVideoIndex`, `removeFromVideoIndex`, `setSyncedAt`) already call `videoIndexStore.set()` — no changes needed there.

## Implementation plan

### 1. `setBroadcast()` on `LocalStorageStore`

Rename current `set()` → `setBroadcast()` (setLocal + BC post). Add optional `onSet` callback param to `createLocalStorageStore`. New `set()` = `setBroadcast()` + `onSet(key, value)`.

Files: `src/lib/external-store.ts`

### 2. BG → Ext store update message

Add ext page port tracking in BG, mirroring `content-ports.ts`. Ext page connects on load. BG sends store updates on the port.

Files: `src/extension/lib/content-ports.ts` (or new `ext-ports.ts`), `src/extension/background.ts`, `src/extension/bookmarks.tsx`

### 3. `storeUpdated` RPC handler + cross-origin wiring

- Content → BG: add `storeUpdated` to `bgRpcHandlers`. BG forwards via `runtime.sendMessage` to ext pages.
- Ext → BG: ext page sends `storeUpdated` via existing `createRuntimeRpc`. BG forwards via `tabs.sendMessage` to a content tab.
- Receiving side calls `setBroadcast()` (same-origin propagation only, no cycle).

Wire `onSet` callback in relay (`relay.ts`) and bookmarks (`bookmarks.tsx`) to send `storeUpdated` to BG.

Files: `src/extension/background.ts`, `src/extension/relay.ts`, `src/extension/bookmarks.tsx`, `src/extension/lib/extension-rpc.ts` (if new message type needed)

### 4. Verify no cycles

`set()` → BG → opposite side → `setBroadcast()` → same-origin BC only → receivers call `setLocal()` → stops. No path loops back to `set()`.

## Status

### Done (PR #154)

- [x] BroadcastChannel-based same-origin sync
- [x] Boot hydration from chrome.storage (both relay and ext page)
- [x] Subscribe-based chrome.storage persistence (both relay and ext page)

### Remaining

- [ ] `setBroadcast()` method on `LocalStorageStore` + `onSet` callback
- [ ] BG → Ext port tracking (mirrors content-ports pattern)
- [ ] `storeUpdated` RPC handler in BG (routes content↔ext)
- [ ] Wire `onSet` in relay and bookmarks to send `storeUpdated` to BG
- [ ] Receiving-side handlers call `setBroadcast()`
