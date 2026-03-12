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

| State                | store    | UI                                    | Where decided        |
| -------------------- | -------- | ------------------------------------- | -------------------- |
| Hydrating            | —        | Loading spinner                       | Caller (before hook) |
| Session found        | non-null | Captions + bookmarks visible          | Hook (immediate)     |
| No session, fetching | null     | Track picker visible, content loading | Hook                 |
| No session, merging  | null     | Track picker visible, content loading | Hook                 |
| Store ready          | non-null | Full UI                               | Hook                 |

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

## Component tree per state

After inlining into CaptionPanel, the question: what should render at each state?

### State 1: Hydrating (IndexedDB query pending)

We don't know anything yet — not which tracks were last used, not whether bookmarks exist.

```
CaptionPanel
├── TrackPicker (disabled? empty selection? or show localStorage guess?)
└── content: skeleton / spinner
```

Problem: TrackPicker needs `vssId1`/`vssId2` to show selection. We can derive from localStorage immediately (synchronous), so TrackPicker can show the _guessed_ selection even before hydration completes. This is actually what happens today — `initialTracks` from localStorage is synchronous.

### State 2: Fetching json3 (tracks known, no store yet)

Tracks are selected, we're waiting for subtitle data.

```
CaptionPanel
├── TrackPicker (shows selection, enabled — user can change tracks)
├── SettingsDropdown — CANNOT render (needs store for strategy, bookmarks count, export)
└── content: skeleton / "Loading subtitles…"
```

### State 3: Store ready

```
CaptionPanel
├── TrackPicker (shows selection, disabled if bookmarks exist)
├── SettingsDropdown (strategy, export, clear bookmarks, auto-scroll, AI prompt)
└── CaptionPanelContent (tabs, captions, bookmarks, FAB)
```

### What's wrong today

The current code renders all hooks unconditionally in CaptionPanel, then conditionally renders UI. This means:

1. **Wasted work**: useMemo for merge, useSyncExternalStore, useZamakApi all run even when store is null.
2. **Null checks everywhere**: `store ?` scattered through the render.
3. **No clear boundary**: The "loading" vs "ready" split is buried in a ternary inside JSX.

### Proposed component split

```
CaptionPanel (outer)
  — owns: hydration query, track selection state, localStorage track prefs
  — always renders: TrackPicker
  — conditionally renders:

  if hydrating or fetching:
    → skeleton/spinner in content area

  if store ready:
    → CaptionSession (inner)
         — owns: store ref, useSyncExternalStore, useZamakApi
         — receives: non-null store, player, tracks
         — renders: SettingsDropdown + CaptionPanelContent
```

The key insight: **CaptionSession should only mount when the store exists**. This means:

- No null store inside CaptionSession — ever
- useSyncExternalStore always has a real store
- useZamakApi always has a real store
- SettingsDropdown/CaptionPanelContent receive non-null store

The outer CaptionPanel handles the "what are we waiting for?" question. The inner CaptionSession handles the "we have data, render it" question.

### Open question: where does json3 fetching live?

Option A: Outer CaptionPanel owns fetch queries + merge. Creates store when ready. Passes store down.
Option B: A middle layer owns fetching. Outer just does hydration + track selection.

Option A keeps it simple — two layers, not three. The outer CaptionPanel is "resolve everything", the inner CaptionSession is "render with resolved data."

### Open question: what about track/strategy changes?

When user changes tracks on an active store:

1. Old store is abandoned (store → null)
2. New json3 fetch starts
3. CaptionSession unmounts (store is null)
4. CaptionSession remounts when new store is ready

This is clean — CaptionSession lifecycle matches store lifecycle. No "store changed under you" problem. The gap where store=null shows the loading state naturally.

But: the gap means useZamakApi briefly installs the stub API. Is that a problem? Probably not — the user can't interact with the AI skill during a 100ms fetch.

## Observations

1. **Store identity = key**: `${youtubeId}:${vssId1}:${vssId2}:${strategy}`. Any change to these → new store, old state gone.

2. **Persistence is bookmark-gated**: Only sessions with bookmarks survive in IndexedDB. Caption edits without bookmarks are ephemeral.

3. **Track change is destructive**: Changing tracks drops all bookmarks. This is by design (bookmarks reference caption indices that change with track pair). But the UX should probably warn if bookmarks exist.

4. **Strategy in hydration is faked**: Hydrated sessions use `"partition"` hardcoded. If the user originally used a different strategy, the dropdown shows wrong value. The session doesn't round-trip strategy.

5. **`useHydratedData` flag**: `!!session && !userVssId1 && !userVssId2`. Once the user changes tracks (even back to the original pair), hydrated data is abandoned and json3 is re-fetched. This means switching A→B→A re-fetches instead of reusing the hydrated rows.

6. **No loading state distinction**: Currently the hook returns `store: null` for both "fetching json3" and "no tracks selected". The caller can't distinguish. May not matter in practice (TrackPicker is always visible).
