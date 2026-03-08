# Caption Panel Component Split

## Problem

`CaptionPanel` is a monolith that mixes multiple concerns:

1. **Track selection** — state, persistence, `TrackPicker` UI
2. **Cue fetching** — two `useQuery` calls, merge logic
3. **Playback sync** — RAF loop polling player time → `currentIndex`
4. **Settings** — auto-scroll, merge strategy, settings dropdown
5. **Export** — `handleExport` builds JSON blob
6. **Rendering** — `CaptionList`

This blocks the future "persisted mode" where captions + bookmarks are already saved — no track selection, no fetching, no merging. The two modes share only the playback-synced caption list, but the current structure forces everything through one component.

## Goal

Split so that:

- **Data acquisition** (track selection + cue fetching + merging) lives in its own component
- **Playback-synced caption viewer** (RAF loop + CaptionList + settings) is a separate component that receives resolved `rows`
- `CaptionList` never renders until rows are ready (no empty-array guard)
- A future "persisted mode" component can feed saved rows directly into the viewer without touching fetch/merge logic

## Proposed Structure

```
CaptionPanel (current entry point, "live mode")
├── TrackPicker + settings header
├── LiveCaptionLoader (track selection state, useQuery, merge)
│   └── CaptionViewer (RAF loop, auto-scroll state, CaptionList)
│       └── CaptionList (pure render)

Future:
PersistedCaptionViewer
├── CaptionViewer (same component, receives saved rows)
│   └── CaptionList
```

### CaptionViewer

Receives resolved data, owns playback sync:

```
props:
  rows: AlignedRow[]        // already merged, non-empty
  player: YTPlayer | null
```

Owns: RAF loop (`currentIndex`, `isPlaying`), auto-scroll state, renders `CaptionList`.

### CaptionPanel (live mode)

Owns: track selection state + persistence, cue fetching (`useQuery`), merge strategy, settings dropdown, export. Renders `TrackPicker` + header + `CaptionViewer` once data is ready.

## Reference Files

- `src/components/caption-panel.tsx` — current monolith (split target)
- `src/components/caption-list.tsx` — pure render (unchanged)
- `src/components/track-picker.tsx` — pure render (unchanged)
- `src/routes/dev-viewer.tsx` — consumer (import changes only)
- `src/extension/content.tsx` — consumer (import changes only)

## Implementation Steps

1. Extract `CaptionViewer` in `caption-panel.tsx` — takes `rows` + `player`, owns RAF loop + auto-scroll + renders `CaptionList`. Only renders when rows are non-empty (caller ensures this).
2. Slim down `CaptionPanel` — track selection, queries, merge, settings header. Renders `CaptionViewer` only after cues are loaded and merged.
3. Move export + settings dropdown to stay in `CaptionPanel` header (they depend on tracks/videoMeta).
4. Verify consumers (`dev-viewer.tsx`, `content.tsx`) — should need no changes beyond imports if any.
5. `pnpm build` + `pnpm test-e2e` to verify.

## Status

- [ ] Plan reviewed
- [ ] Implementation
- [ ] Verified
