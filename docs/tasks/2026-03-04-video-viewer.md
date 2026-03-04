# Video Viewer — Layout, Embed & Caption Panel

**Depends on:** `2026-03-04-caption-schema-rework.md` (text1/text2 schema)

## PRD items

- [ ] viewer page layout — YouTube embed (left) + caption panel (right)
- [ ] YouTube embed component — iframe player API integration
- [ ] caption panel — dual column layout (text1 | text2), fetch by video
- [ ] caption auto-scroll — sync scroll with playback time
- [ ] caption click-to-seek — click row to seek video
- [ ] current caption highlight — active row indicator
- [ ] virtualized caption list — TanStack Virtual

**Out of scope:** repeat/loop mode, bookmark features.

## Implementation steps

### Step 1: Install `@tanstack/react-virtual`

```
pnpm add @tanstack/react-virtual
```

### Step 2: Add YouTube IFrame API types

Create `src/youtube.d.ts` with minimal type declarations for `YT.Player`, `YT.PlayerState`, etc.

### Step 3: Implement viewer page

All in `src/routes/video-viewer.tsx` (one file per conventions).

**Components:**

```
VideoViewerPage     — fetches video + captions, manages layout
├── YouTubeEmbed    — iframe player API, exposes player state
└── CaptionPanel    — virtualized list of caption rows
```

**Layout:**

```
┌──────────────────────────────────────────────┐
│ ← Back to videos          Video Title        │
├──────────────────────┬───────────────────────┤
│                      │ [time] [text1] [text2]│
│   YouTube Embed      │ [time] [text1] [text2]│
│   (16:9)             │ [time] [text1] [text2]│ ← active
│                      │ [time] [text1] [text2]│
├──────────────────────┴───────────────────────┤
```

Grid: `grid-cols-[1fr_1fr]` on lg+, stacked on mobile.

**`useYouTubePlayer` hook:**

- Load YT iframe API script dynamically
- Create `YT.Player` with video's `youtubeId`
- Track `currentTime` via `requestAnimationFrame` while playing
- Return `{ containerRef, currentTime, seekTo }`

**Active caption:** binary search on `begin` timestamps, debounce to ~100ms.

**Auto-scroll:** `scrollToIndex(activeIdx, { align: 'center', behavior: 'smooth' })`. Disable when user scrolls manually; re-enable on click-to-seek.

**Click-to-seek:** row `onClick` → `seekTo(row.begin)`.

**Highlight:** active row gets `bg-blue-50 border-l-2 border-blue-500` or similar.

### Step 4: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`

## Reference files

| File                          | Pattern to follow                       |
| ----------------------------- | --------------------------------------- |
| `src/routes/video-list.tsx`   | Page component, useQuery + orpc pattern |
| `src/routes/video-viewer.tsx` | Stub to replace                         |
| `src/rpc.ts`                  | oRPC client usage                       |

## Status

- **Planning** — awaiting approval
