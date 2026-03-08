# Caption Panel Refactor

## Problem

`dev-viewer.tsx` and `extension/content.tsx` duplicate significant logic:

- `alignByIndex()` function (identical)
- RAF loop for player time sync (identical)
- Track selection state management (same pattern)
- TrackPicker + CaptionList rendering (same pattern)
- Loading/error states (same pattern)

The only real differences are:

1. **Data source**: dev-viewer fetches from fixture JSON files; content.tsx calls YouTube API
2. **Player**: dev-viewer embeds YouTube iframe; content.tsx wraps page `<video>` element
3. **Layout**: dev-viewer has side-by-side player+panel; content.tsx is panel-only (overlay)

## Approach

### 1. Extract `CaptionPanel` component (`src/components/caption-panel.tsx`)

A shared component that handles:

- Track selection state
- Cue fetching via a `fetchCues(track: YouTubeCaptionTrack) => Promise<CaptionCue[]>` prop
- Alignment (`alignByIndex`)
- RAF loop for player sync
- Renders TrackPicker + CaptionList

Props:

```ts
interface CaptionPanelProps {
  tracks: YouTubeCaptionTrack[];
  fetchCues: (track: YouTubeCaptionTrack) => Promise<CaptionCue[]>;
  player: YTPlayer | null;
}
```

### 2. Use React Query for data loading

- `useQuery` for metadata fetching (in each consumer, since data source differs)
- `useQuery` for cue fetching (inside CaptionPanel, keyed by vssId)

### 3. Move `alignByIndex` into `CaptionPanel` (private helper)

### 4. Simplify consumers

- `dev-viewer.tsx`: metadata query + YouTube embed + `<CaptionPanel>`
- `content.tsx`: metadata query + video adapter + `<CaptionPanel>`

Extension needs its own QueryClientProvider since it runs outside the app.

## Reference files

- `src/routes/dev-viewer.tsx` - current dev viewer
- `src/extension/content.tsx` - current extension viewer
- `src/components/caption-list.tsx` - CaptionList component
- `src/components/track-picker.tsx` - TrackPicker component
- `src/components/youtube-player.tsx` - YTPlayer interface + hook

## Status

- [ ] Planning - awaiting feedback
