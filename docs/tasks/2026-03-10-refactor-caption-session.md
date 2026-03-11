# Refactor `useCaptionSession` — extract domain store

## Problem

`src/lib/caption-session.ts` is a ~430-line React hook that tangles domain logic with React lifecycle. The previous refactoring attempt (split into sub-hooks) was rejected because it just redistributed React complexity without fixing the root cause.

### Root cause

Business logic — state transitions, persistence coordination, derived state — is expressed through React primitives (`useState`, `useCallback`, `useEffect`). This creates:

- **Stale closures**: `persistSession` captures `rows`/`sel1`/`sel2` at callback-creation time, called inside `setState` updaters where values may be stale
- **Side effects in setState updaters**: `addBookmarks`, `deleteBookmark`, `updateBookmarks` call `persistSession()` + `syncVideoIndex()` inside `setBookmarks()` — mixes state transitions with async I/O
- **Untestable logic**: can't unit-test persistence coordination, track resolution, or export assembly without rendering React components
- **Confusing state encoding**: hydration uses `null` = loading, `undefined` = no session, truthy = loaded

### Secondary issues (fix along the way)

- Callers re-derive `sel1`/`sel2` from returned vssIds (duplicated `.find()`)
- Export creates DOM elements (`<a>` tag) inside a data hook

## Approach

Extract a plain `CaptionSessionStore` class that owns all state and logic. The React hook becomes a thin subscriber.

### `CaptionSessionStore` (new, no React imports)

A plain class that:

1. **Holds all mutable state** — selected tracks, captions (hydrated or merged), caption overrides, bookmarks, merge strategy, hydration status
2. **Exposes methods** that do state transitions + persistence atomically — no split between "update state here, persist there"
3. **Computes derived state** as getters — `bookmarksByIndex`, `tracksLocked`, `isAutoStrategy`, resolved `sel1`/`sel2`
4. **Notifies on change** — simple callback (`onChange: () => void`) so React (or anything else) can subscribe

```
class CaptionSessionStore {
  // --- Construction ---
  constructor(params: {
    youtubeId: string
    tracks: YouTubeCaptionTrack[]
    videoMeta: VideoMeta
  })

  // --- State (read-only from outside) ---
  selectedVssId1, selectedVssId2: string | undefined
  rows: MergedCaption[] | undefined
  bookmarks: ExtensionBookmark[]
  forceStrategy: MergeStrategy | undefined
  hydrationStatus: 'pending' | 'none' | 'loaded'

  // --- Derived (getters) ---
  get sel1(): YouTubeCaptionTrack | undefined
  get sel2(): YouTubeCaptionTrack | undefined
  get bookmarksByIndex(): Map<number, ExtensionBookmark[]>
  get tracksLocked(): boolean
  get isAutoStrategy(): boolean
  get activeStrategy(): MergeStrategy | undefined
  get loading(): boolean

  // --- Subscriber ---
  onChange: (() => void) | null

  // --- Operations ---
  hydrate(): Promise<void>            // load from IndexedDB, apply tracks + bookmarks
  setCaptions(merged: MergedCaption[], strategy: MergeStrategy): void
  setTracks(v1: string, v2: string): void
  setForceStrategy(s: MergeStrategy | undefined): void
  updateCaptions(entries: ...): void   // caption text overrides
  addBookmarks(selections: ...): void  // create + persist + sync index
  deleteBookmark(id: string): void
  updateBookmarks(entries: ...): void
  clearBookmarks(): void
  buildExportData(): object            // pure data, no DOM
}
```

Key design decisions:

- **No fetching inside the store** — caption fetching stays in React (`useQuery`). The store receives merged results via `setCaptions()`. This keeps the store synchronous and testable, and avoids reimplementing React Query.
- **Persistence is internal** — `addBookmarks` etc. persist to IndexedDB and sync the video index as part of the operation. No external coordination needed.
- **`hydrate()` is async** — called once on init. Sets tracks, captions, bookmarks from IndexedDB if a session exists.
- **`onChange` callback** — dead simple. Called after any state mutation. The React hook calls `useSyncExternalStore` or just `setState({})` to re-render.

### `useCaptionSession` (rewrite, thin adapter)

```
function useCaptionSession({ youtubeId, tracks, fetchJson3, videoMeta }) {
  // 1. Create store (stable ref, recreate on youtubeId change)
  // 2. Subscribe to store.onChange → trigger re-render
  // 3. useEffect → store.hydrate()
  // 4. useQuery × 2 → on data, call store.setCaptions(mergeCaptions(...))
  // 5. Return store properties + methods (same shape as today)
}
```

The hook becomes ~50 lines of wiring. All logic lives in the store.

## Implementation steps

1. Create `CaptionSessionStore` class in `src/lib/caption-session.ts` (above the hook)
2. Move state + operations into the store, one concern at a time:
   a. Track selection + localStorage persistence
   b. Hydration (IndexedDB load)
   c. Captions (merged rows + overrides)
   d. Bookmarks (CRUD + IndexedDB persist + video index sync)
   e. Export data assembly (pure method, no DOM)
3. Rewrite `useCaptionSession` as thin adapter over the store
4. Add `selectedTrack1`/`selectedTrack2` (aliasing `sel1`/`sel2`) to return value
5. Simplify callers (`dev-viewer.tsx`, `content.tsx`) — drop `.find()` re-derivations
6. Move DOM download trigger to the caller or a tiny utility
7. Verify: `pnpm tsc && pnpm lint && pnpm build`
8. Verify: `pnpm test-e2e`

## What stays the same

- `CaptionSessionManager` return type shape (callers don't change beyond dropping `.find()`)
- `caption-session-db.ts`, `extension-bookmarks.ts`, `video-index.ts` — unchanged
- `useQuery` for json3 fetching — stays in React layer

## Reference files

- `src/lib/caption-session.ts` — main file being refactored
- `src/lib/caption-session-db.ts` — IndexedDB persistence (unchanged)
- `src/lib/caption-merge.ts` — merge strategies (unchanged)
- `src/lib/extension-bookmarks.ts` — bookmark types (unchanged)
- `src/lib/video-index.ts` — video index (unchanged)
- `src/routes/dev-viewer.tsx` — consumer (simplify track lookups)
- `src/extension/content.tsx` — consumer (simplify track lookups)
- `src/lib/zamak-api.ts` — consumer (check if simplifiable)

## Status

- [x] Task doc approved
- [x] Implementation
- [x] Verification — tsc, lint, build, all 78 e2e tests pass

### Changes made

- `src/lib/caption-session.ts` — extracted `CaptionSessionStore` class (plain, no React). Rewrote `useCaptionSession` as thin adapter using `useSyncExternalStore`. Exported `VideoMeta` type. Added `selectedTrack1`/`selectedTrack2` to return value. DOM export trigger stays in hook layer.
- `src/routes/dev-viewer.tsx` — removed duplicated `.find()` track lookups, use `session.selectedTrack1`/`selectedTrack2`
- `src/extension/content.tsx` — same simplification
- `src/lib/zamak-api.ts` — import `VideoMeta` from caption-session instead of duplicating
