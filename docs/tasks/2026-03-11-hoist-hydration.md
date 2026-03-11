# Hoist all async loading out of CaptionSessionStore

## Problem

`CaptionSessionStore` manages its own hydration and receives fetched captions via `setCaptions()`. This means the store exists before data is ready, forcing nullable properties everywhere:

- `selectedVssId1`, `selectedVssId2` — `string | undefined`
- `mergedRows` — `MergedCaption[] | undefined`
- `strategy` — `MergeStrategy | undefined`

Every consumer null-checks these. The `hydrationStatus` tri-state adds complexity, and `deleteBookmark`/`clearBookmarks` have to reset it.

## Key insight

**Changing the track pair should reset the entire store.** All internal state — merged rows, bookmarks, overrides, strategy — hinges on the selected track pair. There's no meaningful store without a resolved pair and its captions.

This means: resolve everything async (hydration + json3 fetch + merge) **before** creating the store. The store becomes a fully initialized, non-nullable object. Changing tracks = destroy old store, do async work, create new store.

**Strategy is the same** — it's an input to merging, not a store mutation. Changing strategy = re-merge = new store.

## Current flow

```
Component mounts
  → create store (nullable fields)
  → useEffect: store.hydrate() (async IndexedDB)
  → useQuery × 2 (fetch json3, disabled if hydrated)
  → store.setCaptions() when queries resolve
```

## Proposed flow

```
Hook manages React state: { vssId1, vssId2, strategy }
  ↓
Queries (all inputs resolved before store):
  → getSession(youtubeId) — hydrate from IndexedDB
  → fetchJson3(sel1), fetchJson3(sel2)
  → mergeCaptions(json3_1, json3_2, strategy)
  ↓
Create store (all non-nullable):
  → new CaptionSessionStore({ ..., mergedRows, strategy, bookmarks })
  ↓
User changes tracks or strategy:
  → setState in hook → queries re-run → new store
```

The direction is always **query → store**, never store → query. Track selection and strategy selection are hook-level state that drive queries. The store is a pure output of resolved data.

## What changes

**Store constructor** accepts fully resolved, non-nullable state:

```ts
constructor(params: {
  youtubeId: string
  tracks: YouTubeCaptionTrack[]
  videoMeta: VideoMeta
  vssId1: string
  vssId2: string
  mergedRows: MergedCaption[]
  strategy: MergeStrategy
  bookmarks: ExtensionBookmark[]
})
```

**Remove from store:**
- `hydrate()` method
- `hydrationStatus` field
- `setCaptions()` method
- `setStrategy()` method — strategy changes go through hook state
- `selectedTrack1()` / `selectedTrack2()` derived lookups — constructor resolves tracks, stores them directly
- `selectTracks()` — track changes go through hook state
- Language fallbacks (`?? "ko"`, `?? "en"`) in `exportFile` — tracks are always known

**All properties become non-nullable:**
- `vssId1: string`, `vssId2: string`
- `mergedRows: MergedCaption[]`
- `strategy: MergeStrategy`

**Store becomes simpler** — just state + bookmark CRUD + persistence + export. No lifecycle, no data loading, no selection management.

**Hook owns:**
- `useState` for track pair + strategy (drives queries)
- `useQuery` for hydration, json3 fetches
- `useMemo` for merge
- Store creation (only when all queries resolved)
- Returns `null` while loading — callers already handle this (extension shows "Loading subtitles…")

## Files to change

- `src/lib/caption-session.ts` — store + hook
- `src/routes/dev-viewer.tsx` — handle null store during loading
- `src/extension/content.tsx` — same
- `src/components/caption-panel.tsx` — track/strategy selection callbacks come from hook, not store

## Status

- [ ] Task doc approved
- [ ] Implementation
- [ ] Verification
