# Refactor caption-panel.tsx: State Machine

## Problem

`caption-panel.tsx` has two parallel component trees (`CaptionPanelWithSession` / `CaptionPanelWithoutSession`) that manage the same UI with different data-loading paths. Fetch and render logic are entangled. The goal is to model the core state as an explicit state machine, separating data actions from UI rendering.

## State Machine

```
┌─────────────┐
│  1. Empty    │  (Suspense pending — session query in flight)
└──────┬───────┘
       │ session query resolves
       ├──────────────────────────────────┐
       │ found                            │ not found
       ▼                                  ▼
                          select new
┌──────────────┐          track/strategy        ┌───────────────────┐
│ 2. Restored  │───────────────────────────────▶│ 3. Track Selected  │
│   Session    │                                │   (no captions)    │
└──────────────┘                                └───┬───────────▲───┘
                                                    │           │
                                          captions  │           │ select new
                                          loaded    │           │ track
                                                    ▼           │
                                                ┌───────────────┴───┐
                                                │ 4. Fresh Captions  │
                                                └───────────────────┘
```

### States

| #   | Name             | Data available                             | Current code                                            |
| --- | ---------------- | ------------------------------------------ | ------------------------------------------------------- |
| 1   | Empty            | Nothing — suspense boundary                | `useSuspenseQuery` pending                              |
| 2   | Restored Session | `CaptionSessionManager` from IndexedDB     | `CaptionPanelWithSession`                               |
| 3   | Track Selected   | `vssId1`, `vssId2` chosen, no captions yet | `CaptionPanelWithoutSession` with `store === undefined` |
| 4   | Fresh Captions   | `CaptionSessionManager` from fetched json3 | `CaptionPanelWithoutSession` with `store` defined       |

### Transitions

| From | To  | Trigger                                                             |
| ---- | --- | ------------------------------------------------------------------- |
| 1    | 2   | Session query resolves with saved session                           |
| 1    | 3   | Session query resolves with `null` (+ initial tracks auto-selected) |
| 2    | 3   | User selects new track or strategy (`setStore(null)`)               |
| 3    | 4   | Both json3 queries resolve → `CaptionSessionManager` created        |
| 4    | 3   | User selects new track or strategy (re-enters track selection)      |

### Proposal: reduce to 3 states

States 2 and 4 are structurally identical — both hold a `CaptionSessionManager`. The only difference is the origin (restored vs freshly built), which doesn't matter to the rest of the system. Collapsing them gives a simpler target model:

```
┌───────────────────┐
│ A. No store,      │
│    no tracks       │
└────────┬──────────┘
         │ load session (found) ──────────────────┐
         │ load session (not found)               │
         ▼                                        ▼
┌───────────────────┐    captions       ┌─────────────────┐
│ B. Tracks selected │──── loaded ──────▶│ C. Has store     │
│    no store        │◀── select new ───│                  │
└───────────────────┘    track           └─────────────────┘
```

| State | Data                    |
| ----- | ----------------------- |
| A     | Nothing                 |
| B     | Track pair, no captions |
| C     | `CaptionSessionManager` |

This hasn't happened yet in the code — currently states 2/4 are split across two component branches. This is the refactoring target.

## Implementation Plan

Introduce a `useCaptionStore` hook that owns the full A→B→C lifecycle, replacing the two-component split.

### Hook shape

```ts
useCaptionStore(props: {
  tracks: YouTubeCaptionTrack[];
  videoMeta: YouTubeVideoData;
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
}) => {
  store: CaptionSessionManager | null;   // null = state A or B
  vssId1: string | undefined;            // defined in B and C
  vssId2: string | undefined;
  selectTracks: (v1: string | undefined, v2: string | undefined) => void;  // C→B or B→B
  userStrategy: MergeStrategy | undefined;
  setUserStrategy: (s: MergeStrategy) => void;  // C→B (re-merge)
  error: Error | null;
}
```

### Behavior

1. **Mount (state A)**: `useSuspenseQuery` restores session from IndexedDB
   - Found → jump to C (`store` set immediately)
   - Not found → go to B (initial tracks from `getInitialTracks`, `store = null`)
2. **State B**: two `useQuery` calls fetch json3 for selected tracks
   - Both resolve → `useMemo` builds `CaptionSessionManager` → state C
3. **State C→B**: `selectTracks()` or `setUserStrategy()` nullifies store, triggering new fetches
4. **State B→C**: fetches resolve, new store created (loop)

### Steps

1. Extract `useCaptionStore` hook (can live in `caption-panel.tsx` initially)
2. Merge `CaptionPanelWithSession` and `CaptionPanelWithoutSession` into a single `CaptionPanel` body that consumes the hook
3. Remove dead code from the split

### Revised plan (v2)

No hook extraction — all state logic stays inline in `CaptionPanel`. Drop Suspense; use plain `useQuery` for session restore.

**Single `CaptionPanel` manages these pieces of state:**

- `store: CaptionSessionManager | null` — null in states A and B
- `vssId1, vssId2: string | undefined` — track selection (defined in B and C, derived from store in C)
- `userStrategy: MergeStrategy | undefined`

**Queries (all `useQuery`, no Suspense):**

1. Session restore query — fires once on mount, returns `CaptionSessionManager | null`
   - If found → set `store` directly (A→C)
   - If not found → derive initial tracks, leave `store = null` (A→B)
2. Two json3 queries — enabled when `store === null && vssId1 && vssId2`
   - Both resolve → build `CaptionSessionManager` via `useMemo` (B→C)

**Actions:**

- `selectTracks(v1, v2)` — sets vssId1/vssId2, sets store to null (C→B)
- `setUserStrategy(s)` — sets strategy, sets store to null (C→B)

**Rendering:** single component body, conditionally shows:

- Nothing or spinner when `store === null` and session query pending (A)
- "Loading subtitles…" when `store === null` and tracks selected (B)
- Full caption UI when `store` exists (C)

**Steps:**

1. Replace `useSuspenseQuery` with `useQuery` for session restore
2. Inline all state from `WithSession`/`WithoutSession` into `CaptionPanel`
3. Single render body with `if (!store)` / `else` branching
4. Delete `CaptionPanelWithSession` and `CaptionPanelWithoutSession`

## Reference files

- `src/components/caption-panel.tsx` — main file being refactored
- `src/lib/caption-session.ts` — `CaptionSessionManager`
- `src/lib/caption-session-db.ts` — IndexedDB persistence

## Result

### Final component tree

```
CaptionPanel              — session restore query; returns null while pending (state A)
└─ CaptionPanelInner      — owns store/vssId/strategy state; branches on store:
   ├─ CaptionPanelLoading    — state B: fetches json3, shows only TrackPicker, calls onStoreReady
   └─ CaptionPanelWithStore  — state C: full UI, store guaranteed, no fetch logic
```

Each state maps to a component boundary. The branch point is `store: CaptionSessionManager | undefined` in `CaptionPanelInner`.

### What worked

- The 3-state model (A/B/C) was the right abstraction. Collapsing "restored session" and "fresh captions" into a single "has store" state eliminated the original two-component duplication.
- Splitting at component boundaries per state keeps each component focused — `CaptionPanelLoading` has no store-dependent hooks, `CaptionPanelWithStore` has no fetch hooks.

### What didn't work (iterations)

1. **`useCaptionStore` hook (v1)**: Premature abstraction. Putting everything in a hook doesn't simplify — it just moves the same tangled logic elsewhere.
2. **Single component with conditional rendering (v2)**: All hooks (fetch + store subscriptions) had to coexist in one component, requiring guards like `enabled: !store`, conditional `useSyncExternalStore`, and a three-way `overrideStore` discriminator (`undefined | null | CSM`). The state was technically unified but the code was harder to follow than the original.
3. **`useMemo` for store derivation**: Created stores reactively on every matching render. Switching to `useEffect` + `setStore` made the B→C transition explicit and one-shot.

### Lessons

- **State machine analysis and component boundaries are the same problem.** Each state should map to a component (or early return). Trying to keep all states in one component forces every hook to be conditional.
- **Start with component splits, not hooks.** Hooks don't reduce complexity — they relocate it. Component boundaries actually eliminate code paths from each branch.
- **Avoid three-way discriminators.** `undefined | null | T` to encode "not yet decided | cleared | has value" is a sign of entangled concerns. Split the component so each branch only sees the states it cares about.
- **Don't mix conceptual analysis with UI/implementation details.** The state machine should describe data, not Suspense vs spinners or useMemo vs useEffect. Those are implementation choices made after the model is clear.

## Status

- [x] State machine analysis
- [x] Implementation plan
- [x] Implementation
