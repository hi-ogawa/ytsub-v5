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

Viewer page (full height below global header):

```
┌──────────────────────┬───────────────────────┐
│                      │ [time] [text1] [text2]│
│   YouTube Embed      │ [time] [text1] [text2]│
│   (16:9)             │ [time] [text1] [text2]│ ← active
│                      │ [time] [text1] [text2]│
└──────────────────────┴───────────────────────┘
```

Layout: flex-row on lg+ (player `grow`, captions `w-1/3`), stacked on mobile (same as v3).

**`useYouTubePlayer` hook** (port v3's `usePlayerLoader` + `loadYoutubeIframeApi`):

- Load YT iframe API `<script>` dynamically, singleton pattern
- Create `YT.Player` with video's `youtubeId`, wait for `onReady`
- Expose `YoutubePlayer` interface: `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, `getPlayerState`

**RAF loop** (port v3 pattern):

- `requestAnimationFrame` loop polls `player.getCurrentTime()` every frame
- `findCurrentEntry`: reverse linear scan (v3 `_utils.tsx` — no binary search needed)
- Auto-scroll: only when entry changes, threshold-based (`clientHeight / 6`) to avoid jitter
- `scrollToIndex(idx, { align: 'center', behavior: 'auto' })` — `'auto'` not `'smooth'` (smooth drifts with estimateSize)

**Click-to-seek:** row `onClick` → `seekTo(row.begin)` + `playVideo()`. Toggle play/pause if clicking current entry (v3 pattern).

**Highlight:** current entry border highlight (match v3: `border-colorPrimary` / `ring` when playing).

**Data fetching:** two parallel `useQuery` calls — `getVideo` (for title/youtubeId) + `listCaptions` (for cue data). `id` param needs `Number()` conversion from route string.

### Step 4: Verify

- `pnpm tsc && pnpm lint`
- `pnpm build`

## Reference files

### v5 (this project)

| File                          | Pattern to follow                       |
| ----------------------------- | --------------------------------------- |
| `src/app.tsx`                 | AuthLayout — add global header here     |
| `src/routes/video-list.tsx`   | Page component, useQuery + orpc pattern |
| `src/routes/video-viewer.tsx` | Stub to replace                         |
| `src/rpc.ts`                  | oRPC client usage                       |

### v3 (~/code/personal/ytsub-v3)

| File                              | What to reuse                                                          |
| --------------------------------- | ---------------------------------------------------------------------- |
| `app/routes/videos/$id.tsx`       | Main viewer page — layout, virtualizer setup, RAF loop, auto-scroll    |
| `app/routes/videos/_ui.tsx`       | `CaptionEntryComponent` — row layout (timestamp + text1/text2 columns) |
| `app/routes/videos/_utils.tsx`    | `findCurrentEntry` (reverse linear scan on `begin`)                    |
| `app/utils/youtube.ts` (L386–477) | `YoutubePlayer` interface, `usePlayerLoader` hook, IFrame API loading  |

### Key v3 patterns to port

**Layout** (v3 `$id.tsx` L361–399):

- Mobile: stacked (player top, captions grow below)
- Desktop: `flex-row`, player `grow`, captions `w-1/3` with overflow-y scroll
- Player uses 56.2% padding-top trick for 16:9 aspect ratio

**YouTube player** (v3 `youtube.ts` L420–477):

- `loadYoutubeIframeApi`: load `<script>`, wait for `YT.ready()` callback (singleton)
- `loadYoutubePlayer`: create `new YT.Player(el, opts)`, wait for `onReady` event
- `usePlayerLoader`: ref callback → mutation → `onReady` passes player up
- `YoutubePlayer` interface: `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, `getPlayerState`

**RAF loop** (v3 `$id.tsx` L142–202):

- `useRafLoop` polls `player.getCurrentTime()` every frame
- Calls `findCurrentEntry(entries, currentTime)` — reverse scan, first `begin <= time`
- Auto-scroll: only scrolls when new entry differs from current, uses threshold (`clientHeight / 6`) to avoid jittery scrolls
- `scrollToIndex(idx, { align: 'center', behavior: 'auto' })` — note: `'auto'` not `'smooth'` (smooth causes drift with estimateSize)

**Virtualizer** (v3 `$id.tsx` L263–270):

- `useVirtualizer({ count, getScrollElement, estimateSize: () => 100, overscan: 5 })`
- Render: outer div with `height: getTotalSize()`, inner div with `translateY(items[0].start)`, map `getVirtualItems()`
- Each row uses `ref={virtualizer.measureElement}` for dynamic sizing

**Caption row** (v3 `_ui.tsx` L27–139):

- Row: timestamp header + two flex-1 text columns (text1 left with `border-r`, text2 right)
- Click on text area → `onClickEntryPlay(entry, true)` (toggle play/pause if current)
- Current entry: `border-colorPrimary`, playing: `ring-2 ring-colorPrimaryBorder`

**findCurrentEntry** (v3 `_utils.tsx` L16–26):

- Simple reverse linear scan — good enough for sorted entries, no binary search needed

## Status

- **Planning** — awaiting approval
