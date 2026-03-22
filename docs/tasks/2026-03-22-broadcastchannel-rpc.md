# Replace localStorage RPC bridge with BroadcastChannel

## Problem

The current MAIN↔ISOLATED world RPC bridge in `extension-rpc.ts` uses localStorage + window events as a data channel:

1. Sender dispatches a `CustomEvent` on `window` (event crosses the boundary, but `detail` payload is stripped by Chrome)
2. Receiver picks up the event, does work, writes result to `localStorage`
3. Receiver dispatches a plain `Event` to signal completion
4. Sender reads result from `localStorage`

This works but has drawbacks:

- Two separate mechanisms (events for signaling, localStorage for data)
- Serialization round-trip through localStorage (`JSON.stringify` / `setItem` / `getItem` / `JSON.parse`)
- Single shared key (`zamak:rpc-response`) — concurrent RPCs could theoretically clobber each other (mitigated by ID matching, but the last-write-wins key is still a code smell)
- localStorage writes are visible to page JS and persist across reloads

## Proposed solution: BroadcastChannel

`BroadcastChannel` is a same-origin messaging API that uses structured cloning. Both MAIN and ISOLATED worlds share the page's origin, so it may work as a direct replacement.

```ts
// Both worlds:
const channel = new BroadcastChannel("zamak:rpc");
channel.postMessage({ id, result }); // structured clone, no stripping
channel.onmessage = (e) => {
  /* e.data has full payload */
};
```

Benefits:

- Single mechanism for both signaling and data
- No localStorage pollution
- No JSON serialization (structured clone handles it)
- Per-message delivery (no shared key clobbering)
- Messages are ephemeral (not persisted)

## Key uncertainty

**Does BroadcastChannel cross the MAIN↔ISOLATED boundary?**

Chrome strips `CustomEvent.detail` across worlds for security. BroadcastChannel uses a different mechanism (structured cloning via the browser's message port infrastructure). It _should_ work since both worlds share the same origin, but this needs verification.

## Verification plan

1. Add a minimal test in relay.ts (ISOLATED) and content.tsx (MAIN):
   - ISOLATED: `new BroadcastChannel("zamak:test").onmessage = (e) => console.log("ISOLATED got:", e.data)`
   - MAIN: `new BroadcastChannel("zamak:test").postMessage("hello from MAIN")`
   - And vice versa
2. Load extension on a YouTube page, check console for messages crossing the boundary
3. If it works, proceed with migration; if not, document the finding and close

## Implementation (if verified)

### Reference files

- `src/extension/lib/extension-rpc.ts` — all changes are here
- `src/extension/relay.ts` — no changes expected (calls `setupRpcRelay()` / `setupTabRpcRelay()`)
- `src/extension/content.tsx` — no changes expected (calls `createRpc()` / `registerTabRpcHandlers()`)

### Changes to `extension-rpc.ts`

**Forward RPC (MAIN → ISOLATED → background):**

- `call()`: replace localStorage read + window event listener with `BroadcastChannel("zamak:rpc-response").onmessage`
- `setupRpcRelay()`: replace localStorage write + window event dispatch with `BroadcastChannel("zamak:rpc-response").postMessage(response)`
- Remove `RPC_RESPONSE_KEY`, `RPC_RESPONSE_EVENT` constants

**Reverse RPC (background → ISOLATED → MAIN):**

- `registerTabRpcHandlers()`: replace localStorage write + window event dispatch with `BroadcastChannel("zamak:tab-rpc-response").postMessage(response)`
- `setupTabRpcRelay()`: replace localStorage read + window event listener with `BroadcastChannel("zamak:tab-rpc-response").onmessage`
- Remove `TAB_RPC_RESPONSE_KEY`, `TAB_RPC_RESPONSE_EVENT` constants

**Unchanged:**

- `CustomEvent` dispatch for the _request_ direction still needed (MAIN→ISOLATED for forward, ISOLATED→MAIN for reverse) — or these could also move to BroadcastChannel
- Actually, if BroadcastChannel works, _both_ request and response can use it, eliminating CustomEvent entirely. Two channels: `zamak:rpc` (forward) and `zamak:tab-rpc` (reverse), each carrying both requests and responses distinguished by message shape.

### Simplification opportunity

With BroadcastChannel for both directions, the entire MAIN↔ISOLATED bridge could collapse to:

```
Forward:  MAIN posts {id, method, params} → ISOLATED receives, calls chrome.runtime.sendMessage, posts {id, result/error} → MAIN receives
Reverse:  ISOLATED posts {id, method, params} → MAIN receives, runs handler, posts {id, result/error} → ISOLATED receives
```

No CustomEvent, no localStorage, no window event listeners.

## Verification result

Confirmed via e2e test (`pnpm test-e2e-ext "bookmarks" -g "BroadcastChannel"`):

```
BroadcastChannel test logs: [
  '[zamak MAIN] BroadcastChannel received: hello from ISOLATED',
  '[zamak ISOLATED] BroadcastChannel received: hello from MAIN'
]
```

Both directions work. BroadcastChannel messages cross the MAIN↔ISOLATED boundary with full payload intact (structured clone, no stripping).

## Follow-up: replace store sync relay with BroadcastChannel

The relay currently bridges localStorage store changes (MAIN → ISOLATED → background → `chrome.storage.local`) using window events + localStorage reads. This is the same pattern as the RPC bridge and could also be replaced with BroadcastChannel.

Current flow (relay.ts):

```
MAIN: videoIndexStore.set() → localStorage.setItem + window.dispatchEvent(storeEventName)
ISOLATED: window.addEventListener(storeEventName) → localStorage.getItem → bgRpc.videoIndexUpdated()
```

With BroadcastChannel, the store's `set()` could post the new value directly — the relay receives it in `e.data` without needing to re-read localStorage.

This is currently being reworked to generalize beyond video-index, so defer this cleanup until the store sync generalization lands. The BroadcastChannel migration for RPC and for store sync can be done independently.

## Status

- Verified: BroadcastChannel works across MAIN↔ISOLATED worlds
- Ready to implement: replace localStorage bridge in `extension-rpc.ts`
- Follow-up: store sync relay migration (after store generalization lands)
