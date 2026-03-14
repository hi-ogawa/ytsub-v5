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

## Reference files

- `src/components/caption-panel.tsx` — main file being refactored
- `src/lib/caption-session.ts` — `CaptionSessionManager`
- `src/lib/caption-session-db.ts` — IndexedDB persistence

## Status

- [x] State machine analysis
- [ ] Implementation plan (pending user feedback)
- [ ] Implementation
