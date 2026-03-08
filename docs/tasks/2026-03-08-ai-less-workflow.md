# AI-less Import Workflow

## Problem

The current import pipeline requires an AI agent (openclaw) to orchestrate subtitle fetching, alignment, translation, and vocab extraction. This is fragile, slow (~3-7 min per video), and hard to test.

But most of what the agent does can be replaced by deterministic code + better UI:

- Subtitle fetching → browser extension (same-origin access)
- Alignment → algorithmic (timestamp matching, fuzzy pairing)
- Translation → YouTube auto-translate (ko→en is high quality)
- Vocab bookmarks → manual selection (already built)
- Caption fixes → inline editing UI

**Goal:** Import a video in seconds, not minutes. No agent, no LLM, no yt-dlp.

## Realistic Scenarios

Only three scenarios occur in practice. D (ko auto only, no en) doesn't come up.

| Scenario               | Ko source | En source      | What's needed                                   |
| ---------------------- | --------- | -------------- | ----------------------------------------------- |
| A: Both manual         | manual    | manual         | Alignment only                                  |
| B: Ko auto + En manual | auto      | manual         | Alignment (ko text is readable, not perfect)    |
| C: Ko manual only      | manual    | auto-translate | Fetch auto-translated en track → becomes A or B |

**Every scenario produces two subtitle tracks.** The problem reduces to alignment.

## Pipeline Without AI

```
Browser extension (on YouTube page)
  → Extracts video metadata (title, channel, duration, id)
  → Extracts subtitle tracks (ko + en)
  → Parses → cue arrays
  → Algorithmic alignment → text1/text2 paired rows
  → POSTs import.json to app API (same format as today)

App server
  → Stores in D1 (existing importVideo logic, no changes needed)

Viewer (browser)
  → Current viewer works as-is (aligned pairs)
  → Manual bookmarking via text selection (already built)
```

**Happy path:** All processing happens in the extension. The server receives the same import.json format as today — no schema change, no API change, no viewer change. The only new pieces are the browser extension and a smarter alignment algorithm, both running client-side.

**Fallback:** If alignment can't cover enough cases, explore an unaligned viewer that handles two independent tracks (see `2026-03-08-unaligned-caption-viewer.md`). This would require a schema change.

## Components

### 1. Browser Extension (prerequisite)

Content script running on `youtube.com/*` that:

- Reads video metadata from the page / YouTube player API
- Fetches subtitle tracks (YouTube exposes these via `timedtext` API from same origin)
- Downloads ko + en (or auto-translated en)
- Parses subtitles → cue arrays (port of `parse-json3.ts`)
- Runs algorithmic alignment → text1/text2 paired rows
- POSTs import.json to the app API (same format as current `importVideo`)

This is the **biggest piece of new work** and the main blocker. Already in the backlog.

Key questions:

- Manifest V3 constraints?
- How does YouTube expose subtitle track list? (`ytInitialPlayerResponse.captions`)
- Can we fetch json3 format directly, or need to convert from another format?

### 2. Algorithmic Alignment (without LLM)

The current `check-alignment.ts` is strict: same cue count + all timestamps within 0.5s tolerance, or fail. This means any count mismatch falls through to LLM. A smarter algorithm could handle most of these cases deterministically.

**Why this matters:** Even if the viewer can display unaligned tracks (see unaligned-caption-viewer doc), aligned pairs are a better reading experience. The two approaches are complementary — better alignment algorithm reduces the cases where the viewer needs to fall back to unaligned display.

**Approaches (increasing sophistication):**

1. **Relaxed 1:1 matching** — keep the current approach but increase tolerance (e.g., 2s instead of 0.5s) and allow small count differences (skip unmatched cues at the end)

2. **Greedy nearest-neighbor** — for each ko cue, pair with the en cue whose begin time is closest. Simple, handles count mismatches. Risk: can produce bad pairings when timing drifts significantly.

3. **Overlap-based pairing** — pair cues whose time ranges overlap. Naturally produces N:M groupings (one ko cue overlaps two en cues, or vice versa). The viewer's time-banded grouping (option C in unaligned-caption-viewer) maps directly to this.

4. **Dynamic time warping (DTW)** — standard technique for aligning two temporal sequences. Finds optimal global alignment minimizing total timestamp distance. Handles different cue counts, timing drift, and split/merge cases. Well-studied algorithm, easy to implement.

5. **Split/merge detection** — detect when one language splits a cue into two (or merges two into one). Heuristic: if ko cue [0-5s] maps to en cues [0-2.5s] + [2.5-5s], merge the en text. Common with auto-generated vs manual subs.

**Output:** Aligned text1/text2 rows — same schema as today. For N:M cases (split/merge), concatenate the text of merged cues. This means no schema change needed for the happy path.

**Testable:** Unlike LLM-based alignment, algorithmic alignment is fully deterministic and testable. Can run against the eval videos and compare output quality with current agent-produced alignments.

## What This Replaces

| Current (agent)                         | AI-less                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| yt-dlp (local CLI)                      | Browser extension (same-origin)                                    |
| parse-json3.ts (agent runs)             | Extension-side parsing (same code, runs in browser)                |
| check-alignment.ts (agent runs)         | Extension-side fuzzy alignment (DTW or overlap-based)              |
| LLM caption alignment (scenarios B/C/D) | Algorithmic alignment (same output format)                         |
| LLM Korean text fixing                  | Accept auto-gen quality or manual edit                             |
| LLM translation (scenario C)            | YouTube auto-translate                                             |
| LLM vocab extraction                    | Manual bookmarking (already built)                                 |
| LLM bookmark metadata                   | Manual entry or skip                                               |
| validate-bookmarks.ts (agent runs)      | Not needed (manual bookmarks have correct offsets by construction) |

## Phased Plan

### Phase 1: Browser Extension

- Build Chrome extension (Manifest V3)
- Extract video metadata + subtitle tracks from YouTube page
- POST to app API
- **This is the main blocker — everything else can be prototyped with existing import.json upload**

### Phase 2: Algorithmic Alignment

- Upgrade from strict 1:1 matching to fuzzy alignment (DTW or overlap-based)
- Output text1/text2 rows (same schema as today — no migration needed)
- Test against eval videos (`ytsub-eval` test set) — compare with current agent output
- Can prototype independently of Phase 1 using existing subtitle data

### Phase 3 (if needed): Unaligned Viewer + Schema Change

- Only needed if Phase 2 alignment can't cover enough cases
- Schema change to store raw per-language cues instead of pre-aligned rows
- Viewer that handles two independent tracks with temporal proximity
- See `2026-03-08-unaligned-caption-viewer.md` for design options
- Caption inline editing for remaining issues

### Future: Cloud AI as Optional Enhancement

- Auto-fix garbled Korean text
- Suggest bookmarks
- Fill in etymology/notes
- See `2026-03-08-cloud-ai-integration.md`

## Related Docs

- `2026-03-08-cloud-ai-integration.md` — cloud AI brainstorm (deprioritized in favor of this)
- `2026-03-08-unaligned-caption-viewer.md` — viewer design for unaligned captions
- `docs/skills/ytsub/SKILL.md` — current agent skill (what this replaces)
- `docs/skills/ytsub-eval/SKILL.md` — eval data showing agent costs

## Status

- **Phase:** Planning / awaiting feedback
- **Blocker:** Browser extension for subtitle fetching (Phase 1)
- **Next:** Assess extension feasibility; prototype alignment algorithm against eval data (Phase 2, can start independently)
