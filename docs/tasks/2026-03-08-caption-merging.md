# Caption Merging Algorithm

## Problem

The current v5 alignment (`check-alignment.ts`) is all-or-nothing: same cue count + every timestamp within 0.5s, or fail entirely. Any mismatch falls through to LLM alignment, which is slow and expensive.

In practice, YouTube subtitle tracks for the same video almost always differ in cue count and timing — even two manual tracks. Auto-generated tracks are worse. The strict check fails on most real videos, making the LLM the de facto aligner.

**Goal:** A deterministic merging algorithm that handles count mismatches, timing drift, and split/merge cues — covering the cases currently handled by LLM. Output is the same `{ idx, begin, end, text1, text2 }[]` format. No schema change needed.

## Prior Art

### V5 strict check (`check-alignment.ts`)

- Requires identical cue count
- All `begin` timestamps must match within 0.5s tolerance
- If aligned: use lang1 timestamps, zip texts
- Binary: either perfect match or total failure
- Works for scenario A (both manual, well-synced) — fails on everything else

### V4 heuristic (`mergeCaptionEntryPairs` in `ytsub-v4/src/utils/youtube.ts`)

Two-tier approach:

1. **Simple path** (`mergeCaptionEntryPairsSimple`): Group cues by identical `{begin, end}` timestamps. If every group has at most 1 cue per language → 1:1 pairs. Otherwise bail to heuristic.

2. **Heuristic fallback**: For each cue in lang1, compute time overlap with all lang2 cues:
   - `overlap = max(0, min(e1.end, e2.end) - max(e1.begin, e2.begin))`
   - If any lang2 cues overlap ≥ 2s → concatenate their texts
   - Otherwise → pick single best overlap
   - If no overlap → leave text2 empty
   - Always uses lang1 as the timeline (1:N merge, not bidirectional)

**V4 strengths:** Always produces output. Handles count mismatches and timing drift. Proven on real YouTube data.

**V4 weaknesses:** One-directional (lang1→lang2 only). A lang2 cue can be "claimed" by multiple lang1 cues, producing duplicate text. No N:1 merging (can't merge lang1 cues when they map to the same lang2 cue). Concatenation can produce awkward text boundaries.

## Approaches

### 1. Port v4 as-is

Lowest effort. Already proven. Covers most cases. Start here as baseline.

### 2. Relaxed simple path

Increase tolerance in the simple path (e.g., 1-2s instead of exact match). More cases resolve without the heuristic fallback.

### 3. Bidirectional overlap

After the lang1→lang2 pass, do a reverse pass: for each lang2 cue, check if it was claimed by multiple lang1 cues. Deduplicate by assigning each lang2 cue to the lang1 cue with best overlap. Fixes the duplicate text problem.

### 4. Dynamic time warping (DTW)

Standard technique for aligning two temporal sequences. Finds globally optimal alignment with a cost matrix. Handles different cue counts, timing drift, and split/merge naturally.

More sophisticated than overlap heuristic. May be overkill if v4's approach covers enough cases. But it's well-understood and not hard to implement.

### 5. Split/merge detection

Detect when one language splits a cue that the other language keeps as one (or vice versa). V4 handles 1:N (concatenation). Add N:1 (merge lang1 cues when they map to the same lang2 cue). Combined with bidirectional overlap, this handles most real-world patterns.

## Proposed Plan

**Phase 1: Port v4 + test harness**

- Port v4's `mergeCaptionEntryPairs` to `src/lib/caption-merge.ts` as a standalone module
- Build test fixtures from existing imported videos (use agent-produced alignments as ground truth)
- Also test with raw json3 cue pairs from youtube-json/ directory
- Measure: what % of videos align correctly vs agent output?

**Phase 2: Improve based on failure cases**

- Analyze Phase 1 failures — what patterns does v4 get wrong?
- Apply fixes in priority order: relaxed simple path → bidirectional dedup → split/merge detection → DTW (if needed)
- Each improvement is testable against the same fixture set

**Phase 3: Integration**

- Wire into the browser extension pipeline (replace current check-alignment)
- Extension: extract → parse → merge → POST
- No server-side changes — output format is identical

## Reference Files

- `~/code/personal/ytsub-v4/src/utils/youtube.ts` — v4 alignment (`mergeCaptionEntryPairs`, lines ~215-310)
- `docs/skills/ytsub/scripts/check-alignment.ts` — v5 strict alignment
- `docs/skills/ytsub/scripts/parse-json3.ts` — json3 parser
- `src/lib/youtube.ts` — v5 YouTube extraction module (merge module goes alongside this)
- `docs/tasks/2026-03-08-ai-less-workflow.md` — parent plan
- `docs/tasks/2026-03-08-browser-extension.md` — extension context

## Open Questions

- Which language should be the timeline basis? V4 always uses lang1 (Korean). But in scenario B (ko auto + en manual), English timestamps may be more reliable. Should the algorithm accept a "primary track" parameter?
- How to evaluate quality? Diff against agent-produced alignments? Manual review? Both?
- Should the module handle >2 languages, or is bilingual sufficient?

## Status

- **Phase:** Planning / awaiting feedback
- **Next:** Feedback on approach, then Phase 1 implementation
