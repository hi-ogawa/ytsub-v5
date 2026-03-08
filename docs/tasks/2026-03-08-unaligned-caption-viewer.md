# Unaligned Caption Viewer — Design Exploration

## Problem

The current viewer assumes 1:1 aligned caption pairs (text1/text2 in the same row). This requires a pre-processing step (algorithmic or LLM) to merge two subtitle tracks into paired rows before import.

If the viewer could display **two independent subtitle tracks without pre-alignment**, the import pipeline simplifies dramatically: just fetch two json3 files and store the raw cues. No merging, no alignment scripts, no LLM. The viewer becomes the alignment layer.

## Context

- Realistic subtitle scenarios are always A (both manual), B (ko auto + en manual), or C (ko manual + en auto-translated). Every case produces two tracks.
- Current alignment script (`check-alignment.ts`) only handles perfect 1:1 matches (same count, timestamps within 0.5s). Anything else currently requires LLM intervention.
- Manual bookmarking already works via text selection — doesn't depend on alignment.
- See `docs/tasks/2026-03-08-cloud-ai-integration.md` for broader pipeline context.

## Design Directions

### A: Dual Independent Streams

Two columns, each scrolling independently based on its own timestamps.

```
┌─────────────────────┬─────────────────────┐
│ Ko (auto-scroll)    │ En (auto-scroll)    │
│                     │                     │
│   꿈을 꾸는 것 같아    │                     │
│ ► 눈을 떠도 꿈속인데   │ ► Even when I open   │
│                     │   my eyes I'm still  │
│                     │   dreaming           │
│   이상한 나라에 온 걸까 │   Am I in wonderland │
│                     │                     │
└─────────────────────┴─────────────────────┘
        ► = current cue (highlighted by playback time)
```

- Each column highlights its "current" cue based on video time
- Each column auto-scrolls to its current cue independently
- Click-to-seek works in both columns (each cue has its own timestamp)
- No alignment needed at all — just two arrays of `{begin, end, text}`

**Pros:**

- Simplest data model — just store raw cues per language
- Works with any subtitle source, no pre-processing
- Natural for subtitles with very different segmentation (e.g., 50 ko cues vs 80 en cues)

**Cons:**

- Loses the "glanceable pair" — harder to see which en matches which ko at a given moment
- Two independent scroll positions may feel disorienting
- Bookmark `captionIdx` would need to reference a specific language track, not a merged row

### B: Primary Track + Floating Secondary

Ko is the main list (drives scroll). En appears as contextual annotation for the current cue.

```
┌───────────────────────────────────────────┐
│                                           │
│   꿈을 꾸는 것 같아                          │
│ ► 눈을 떠도 꿈속인데                         │
│   ┊ Even when I open my eyes              │
│   ┊ I'm still dreaming                    │
│   이상한 나라에 온 걸까                       │
│                                           │
└───────────────────────────────────────────┘
      ┊ = secondary cue (temporally closest en)
```

- Ko cues are the scroll list (same as current viewer, but single-language)
- Below (or beside) the current ko cue, show the en cue(s) whose time range overlaps
- Could show 0, 1, or 2+ en cues depending on overlap

**Pros:**

- Single scroll position — clean, focused
- Ko text is the primary study material, en is reference
- Feels like "subtitles with translation tooltip"

**Cons:**

- Only see en for the current cue — can't scan ahead/behind in en
- Asymmetric — what if user wants en as primary?
- Multiple overlapping en cues need visual treatment

### C: Time-banded Grouping

Single scrolling list, but cues are grouped by time bands rather than 1:1 pairing.

```
┌───────────────────────────────────────────┐
│ ┌─ 0:25 ─────────────────────────────── ┐ │
│ │ 꿈을 꾸는 것 같아                       │ │
│ │ It feels like a dream                 │ │
│ └───────────────────────────────────────┘ │
│ ┌─ 0:29 ─────────────────────────────── ┐ │
│ │ 눈을 떠도 꿈속인데                      │ │
│ │ 이상한 나라에 온 걸까                    │ │
│ │ Even when I open my eyes, dreaming    │ │
│ │ Am I in wonderland                    │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

- Group cues into time windows (e.g., 3-5s bands, or by natural gaps)
- Within each band, show all ko cues then all en cues (or interleaved)
- Band boundaries determined by clustering cue timestamps

**Pros:**

- Single scroll, paired feel
- Handles N:M naturally — 2 ko cues + 1 en cue in the same band is fine
- Closest to current UX (still feels like "rows")

**Cons:**

- Grouping algorithm needs tuning (band size, gap detection)
- Visual clutter when many cues land in the same band
- Not obvious which ko maps to which en within a band

### D: Hybrid — Aligned When Possible, Unaligned Fallback

Use alignment when it works (scenario A with matching counts), fall back to dual streams or time-banding when it doesn't.

- Import stores raw cues per language (always)
- At display time, attempt lightweight alignment (timestamp proximity matching)
- If alignment is strong (high confidence 1:1), render as paired rows (current UX)
- If alignment is weak, fall back to direction A, B, or C

**Pros:**

- Best UX for well-aligned content (which is common for scenario A)
- Graceful degradation for misaligned content
- Alignment is a display concern, not a data concern

**Cons:**

- Two rendering modes to build and maintain
- "Confidence" threshold needs tuning
- May be confusing if the same video switches between modes

## Data Model Implications

Current model: `captions` table has `text1` + `text2` per row (pre-aligned).

Unaligned model options:

1. **Two rows per cue** — add a `language` column, each cue is its own row. Simple, flexible.
2. **Separate tables** — `captions_ko`, `captions_en`. Awkward.
3. **Keep current schema, nullable text2** — store ko cues as primary, leave text2 null. Populate text2 at display time via temporal matching. Minimal migration.

Option 1 is cleanest. Would need to update the viewer queries and components.

## Interaction with Existing Features

| Feature                             | Impact                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Click-to-seek                       | Works — each cue has its own timestamp                                                     |
| Auto-scroll                         | Works — sync to current cue per language                                                   |
| Current cue highlight               | Works — per language track                                                                 |
| Manual bookmarking (text selection) | Works — need to know which language track the selection is in (already tracked via `side`) |
| Bookmark indicators                 | Need to associate bookmark with a cue in a specific language, not a merged row             |
| Bookmark navigation (prev/next)     | Works — navigate by timestamp                                                              |
| Virtualized list                    | Works with all approaches (TanStack Virtual)                                               |

## Open Questions

- Which direction feels right? (A/B/C/D or something else)
- Should aligned import (current format) still be supported, or migrate everything to raw cues?
- Is ko always the primary language, or should it be configurable?
- How does this affect the import flow? (Currently `importVideo` expects merged captions with text1/text2)

## Status

- **Phase:** Early exploration / awaiting feedback
- **Next:** Get feedback on design direction before prototyping
