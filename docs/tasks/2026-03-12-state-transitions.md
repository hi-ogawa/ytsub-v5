# Caption Session State Transitions

## State diagram

```
┌──────────────┐
│  Hydrating   │
│  (IndexedDB) │
└──────┬───────┘
       │
       ├── session found ──► Store ready (hydrated rows + bookmarks)
       │                          │
       │                          ├── change tracks ───────┐
       │                          ├── change strategy ─────┤
       │                          ├── add/delete bookmark  │ (mutate in place)
       │                          ├── edit captions        │ (mutate in place)
       │                          └── clear bookmarks      │ (mutate in place)
       │                                                   │
       └── no session ─────────────────────────────────────┤
                                                           ▼
                                                   ┌──────────────┐
                                          ┌───────►│  Fetching    │
                                          │        │  json3 × 2   │
                                          │        └──────┬───────┘
                                          │               │
                                          │               ▼
                                          │        ┌──────────────┐
                                          │        │  Merging     │
                                          │        └──────┬───────┘
                                          │               │
                                          │               ▼
                                          │        Store ready (fresh rows, no bookmarks)
                                          │               │
                                          │               ├── change tracks ───────┘
                                          │               ├── change strategy ─────┘
                                          │               ├── add/delete bookmark (mutate)
                                          │               ├── edit captions (mutate)
                                          └───────────────└── clear bookmarks (mutate)
```

Simplified: two store-active states share the same shape. The cycle is:

```
Store ready ── change tracks/strategy ──► Fetching ──► Merging ──► Store ready
     │                                                                  │
     └── mutate (bookmark/caption ops, no state transition) ◄───────────┘
```

## States

| State | store | UI | Where decided |
|-------|-------|----|---------------|
| Hydrating | — | Loading spinner | Caller (before hook) |
| Session found | non-null | Captions + bookmarks visible | Hook (immediate) |
| No session, fetching | null | Track picker visible, content loading | Hook |
| No session, merging | null | Track picker visible, content loading | Hook |
| Store ready | non-null | Full UI | Hook |

## Transitions

### Happy paths

**Returning user (session in DB):**
```
Hydrating → Session found → Store ready (instant, no fetch)
```

**New video (no session):**
```
Hydrating → No session → Fetching json3 → Merging → Store ready
```

### User actions on active store

**Change tracks** (`selectTracks`):
```
Store ready → sets userVssId1/2 → useHydratedData=false
  → Fetching json3 (new tracks) → Merging → NEW Store ready
Old store destroyed. Bookmarks lost (correct — they belong to old track pair).
```

**Change strategy** (`selectStrategy`):
```
Store ready → sets userStrategy → re-merge → NEW Store ready
Old store destroyed. Bookmarks lost (correct — re-merge changes row alignment).
```

**Add bookmark** (`store.createBookmarks`):
```
Store ready → mutates store.bookmarks → notify → persist to IndexedDB
  → also updates video-index in localStorage
Store identity unchanged (same ref).
```

**Delete bookmark** (`store.deleteBookmark`):
```
Store ready → mutates store.bookmarks → notify
  → if bookmarks remain: persist to IndexedDB
  → if no bookmarks left: delete session from IndexedDB
Store identity unchanged.
```

**Clear all bookmarks** (`store.clearBookmarks`):
```
Store ready → bookmarks=[] → notify → delete session from IndexedDB
Store identity unchanged (but session gone from DB).
```

**Edit captions** (`store.updateCaptions`):
```
Store ready → mutates store.rows → notify → persist to IndexedDB
Store identity unchanged.
```

**Update bookmark metadata** (`store.updateBookmarks`):
```
Store ready → mutates store.bookmarks → notify → persist to IndexedDB
Store identity unchanged.
```

### Edge cases / questions

**Close panel + reopen (same video):**
```
Store destroyed → Hydrating → Session found (if bookmarks were saved)
                             → No session (if no bookmarks / cleared)
```
Note: `gcTime: 0` ensures fresh IndexedDB read, not stale cache.

**Close panel + reopen after clearing bookmarks:**
```
Store destroyed → Hydrating → No session → Fetching → Merging → Store ready
Captions re-fetched and re-merged from scratch. Any caption edits lost.
```
This is correct — caption edits only survive as long as bookmarks exist (they trigger persist).

**Change tracks when hydrated session exists:**
```
Store ready (hydrated) → selectTracks → useHydratedData=false
  → previous session's bookmarks dropped (new track pair)
  → Fetching json3 → Merging → NEW Store ready (empty bookmarks)
```
Old session stays in IndexedDB until overwritten. Is this correct? Should we delete it?

## Key insight: this is a DAG, not cyclic

The data flows strictly forward:

```
hydration ──┐
             ├──► track resolution ──► json3 fetch ──► merge ──► store
localStorage ┘
```

User actions on the store (add bookmark, edit caption) mutate in place and persist to IndexedDB — but they never feed back into the upstream pipeline. The store is a leaf node. Changing tracks or strategy doesn't "update" the store, it restarts the pipeline from scratch and produces a new store.

This DAG nature means the hook could be much simpler — a linear pipeline of derived values rather than the current tangle of `useHydratedData` flags and conditional query enabling.

**Change tracks = re-fetch**: Changing tracks should always re-fetch json3 and re-merge. This is correct because different tracks have different subtitle data. The current behavior is right — `useHydratedData` becomes false, queries enable, new data flows through.

## Next step: inline useCaptionSession into CaptionPanel

The `useCaptionSession` abstraction is obscuring the actual state/data flow. Rather than trying to redesign it top-down, inline everything into `CaptionPanel` so all state, queries, and branching are visible in one place. From there, the natural boundaries should become obvious.

Currently `useCaptionSession` is used in two places:
- `ExtensionSession` (content.tsx) — passes result to `CaptionPanel`
- `DevViewerReady` (dev-viewer.tsx) — passes result to `CaptionPanel`

Both callers exist only to call the hook and forward to `CaptionPanel`. If CaptionPanel owns the hook logic directly, these wrapper components may collapse.

## Observations

1. **Store identity = key**: `${youtubeId}:${vssId1}:${vssId2}:${strategy}`. Any change to these → new store, old state gone.

2. **Persistence is bookmark-gated**: Only sessions with bookmarks survive in IndexedDB. Caption edits without bookmarks are ephemeral.

3. **Track change is destructive**: Changing tracks drops all bookmarks. This is by design (bookmarks reference caption indices that change with track pair). But the UX should probably warn if bookmarks exist.

4. **Strategy in hydration is faked**: Hydrated sessions use `"partition"` hardcoded. If the user originally used a different strategy, the dropdown shows wrong value. The session doesn't round-trip strategy.

5. **`useHydratedData` flag**: `!!session && !userVssId1 && !userVssId2`. Once the user changes tracks (even back to the original pair), hydrated data is abandoned and json3 is re-fetched. This means switching A→B→A re-fetches instead of reusing the hydrated rows.

6. **No loading state distinction**: Currently the hook returns `store: null` for both "fetching json3" and "no tracks selected". The caller can't distinguish. May not matter in practice (TrackPicker is always visible).
