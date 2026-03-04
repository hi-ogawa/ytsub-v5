# Video Viewer — Layout & Mockup

## Problem

The viewer page (`/videos/:id`) is a stub. We need to build the core viewer layout: YouTube embed on the left, dual caption panel on the right. This task focuses on **pure UI mockup with hardcoded data** — no server integration, no YouTube iframe API yet.

## Goal

A static, visually complete viewer page that establishes the layout, component structure, and styling. Once approved, subsequent tasks will wire up real data (captions API), YouTube player API, and interactive features (scroll sync, click-to-seek, etc.).

## Current State

- **Viewer stub:** `src/routes/video-viewer.tsx` — shows "Video {id}" with back link
- **No components dir** — all UI lives in `src/routes/`
- **Schema context:** captions have `language`, `idx`, `begin`, `end`, `text` per cue
- **Styling:** Tailwind 4, no component library

## Reference: ytsub-v3

The v3 viewer (`app/routes/videos/$id.tsx`) is the primary reference. Key patterns to carry forward:

### Layout (v3: `LayoutComponent`)

```
Mobile:                  Desktop:
+-----------+            +--------------+-----------+
|  PLAYER   | 16:9       |              |           |
+-----------+            |    PLAYER    | SUBTITLES |
| SUBTITLES | grow       |              |           |
+-----------+            +--------------+-----------+
                              grow        1/3 width
```

- `h-full w-full flex flex-col lg:(flex-row gap-2 p-2)`
- Player: `flex-none lg:grow`
- Captions: `flex-[1_0_0]` with `overflow-y-auto`
- Player aspect ratio: `relative pt-[56.2%]` (16:9 padding trick)

### Caption Row (v3: `CaptionEntryComponent` in `_ui.tsx`)

Each row shows:

- **Top bar:** timestamp range (`begin - end`), action buttons (play, repeat)
- **Body:** two columns — `text1` (left, `border-r`) | `text2` (right), click to play/pause
- **Highlight:** active entry gets `border-colorPrimary` + `ring-2 ring-colorPrimaryBorder` when playing
- **Data attributes:** `data-index`, `data-side`, `data-offset` for bookmark text selection (future)

### Patterns to adopt

- Full viewport height, no page scroll — panels scroll independently
- `CaptionEntry` type: `{ index, begin, end, text1, text2 }` — v3 used this shape
- Virtualized list (TanStack Virtual) — v3 used `estimateSize: 100`, `overscan: 5`

### Patterns to simplify for mockup

- Real YouTube iframe embed (hardcoded video ID), but no iframe Player API integration yet (`usePlayerLoader`, `useRafLoop`)
- No bookmark highlight/selection (`HighlightText`, `partitionRanges`)
- No repeat mode, playback rate, auto-scroll toggle
- No nav bar menu or details modal

## Design

### Layout

```
┌─────────────────────────────────────────────────┐
│ ← Back to videos    Video Title                 │
├──────────────────────┬──────────────────────────┤
│                      │  00:01  안녕하세요  Hello  │
│   YouTube Embed      │  00:03  감사합니다  Thank  │
│   (placeholder)      │ *00:05  네, 맞아요  Yes*  │ ← highlighted
│                      │  00:08  잠깐만요   Wait   │
│                      │  text1        text2       │
├──────────────────────┴──────────────────────────┤
│ (future: controls bar)                          │
└─────────────────────────────────────────────────┘
```

- Follow v3 layout: player grows on desktop, captions take 1/3 width
- Responsive: stack vertically on mobile (player on top, captions below)
- Full viewport height

### Hardcoded Mock Data

```ts
const MOCK_CAPTIONS = [
  { idx: 0, begin: 1.0, end: 2.5, text1: "안녕하세요", text2: "Hello" },
  { idx: 1, begin: 3.0, end: 4.5, text1: "감사합니다", text2: "Thank you" },
  {
    idx: 2,
    begin: 5.0,
    end: 7.0,
    text1: "네, 맞아요",
    text2: "Yes, that's right",
  },
  // ~10-15 rows total
];
const MOCK_ACTIVE_INDEX = 2;
```

This mirrors the v3 `CaptionEntry` shape: `idx`/`index`, `begin`, `end`, `text1`, `text2`.

### Component Structure

- `src/routes/video-viewer.tsx` — `VideoViewerPage` (top-level layout, mock state)
- `src/components/video-embed.tsx` — `VideoEmbed` (YouTube iframe with hardcoded video ID, reusable for real player later)
- `src/components/caption-panel.tsx` — `CaptionPanel` + `CaptionRow` (scrollable list, dual column)

### Caption Row Detail

Following v3's `CaptionEntryComponent`:

```
┌──────────────────────────────────┐
│                    0:01 - 0:02 ▶ │  ← timestamp + play button
│  안녕하세요     │  Hello          │  ← text1 | text2
└──────────────────────────────────┘
```

- Active row: colored border (like v3's `border-colorPrimary`)
- Click body to toggle play (wired later, just visual for now)
- `data-index` attribute on row for future bookmark integration

## Implementation Steps

1. Define mock caption data and types inline
2. Build the two-panel layout (flexbox, full viewport height, v3-style responsive)
3. Build `VideoEmbed` with hardcoded YouTube iframe (16:9 via padding trick)
4. Build `CaptionPanel` with `CaptionRow` components (v3 `CaptionEntryComponent` style)
5. Style the active/highlighted row (border + ring)
6. Verify with `pnpm build`

## Status

- **Not started**
