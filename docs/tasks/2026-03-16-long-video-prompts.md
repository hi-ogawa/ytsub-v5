# Long Video AI Prompt Handling

## Problem

A 30-minute video (e.g. `youtube.com/watch?v=-pLYheT4FL4`) produces ~70KB of prompt text when all captions are inlined. This can:

1. **Freeze chat UIs** — pasting 70KB+ into Claude.ai/ChatGPT text box causes lag or crashes
2. **Degrade LLM quality** — large context dilutes attention; vocab picking quality drops
3. **Hit token limits** — 70KB ≈ 25-30K tokens; some models/tiers have 8-16K input limits
4. **Waste tokens/money** — most of a 30-min transcript is irrelevant to any single vocabulary pick

Current `makeAiPrompt()` dumps ALL captions via `formatCaptions(rows)` with no size awareness.

### Scale reference

| Duration | Captions | Prompt size | Tokens (est.) |
| -------- | -------- | ----------- | ------------- |
| 5 min    | ~30      | ~5 KB       | ~2K           |
| 10 min   | ~60      | ~10 KB      | ~4K           |
| 30 min   | ~180     | ~70 KB      | ~25K          |
| 1 hour   | ~360     | ~140 KB     | ~50K          |
| 2 hours  | ~720     | ~280 KB     | ~100K         |

## Approaches

### A. Time-range chunking (recommended starting point)

Split captions into fixed-duration chunks (e.g. 5-minute windows) and generate one prompt per chunk. User processes chunks sequentially; app merges results.

**How it works:**

1. `makeAiPrompt()` accepts an optional `range: { start: number; end: number }` (caption indices or timestamps)
2. UI shows chunk navigator: "Chunk 1/6 (0:00–5:00)" with prev/next buttons
3. Each chunk prompt includes only that chunk's captions + full instructions
4. Import merges results — caption indices are offset-adjusted so they map to global indices
5. Target count scales per chunk: `chunkDuration / 10` instead of `totalDuration / 10`

**Pros:** Simple, predictable prompt size, works with any LLM
**Cons:** Multiple round-trips, user must manually process each chunk

**Variant — auto-chunk with download:**

- Download a `.zip` or numbered `.txt` files: `prompt-1of6.txt`, `prompt-2of6.txt`
- User uploads each to LLM, pastes results back sequentially
- App accumulates bookmarks across chunks

### B. Smart caption filtering (pre-processing)

Reduce prompt size by filtering out low-value captions before sending.

**Strategies:**

1. **Deduplicate** — Remove repeated/near-identical captions (common in music videos, repetitive speech)
2. **Skip silence/music markers** — Filter captions that are just `[음악]`, `[박수]`, `♪♪`, etc.
3. **Language complexity filter** — Use character-class heuristics to skip captions with only basic vocabulary (short captions with only common syllables)
4. **Density sampling** — For very long videos, sample every Nth caption to stay under a size budget

**Pros:** Transparent to user, smaller prompts, better signal-to-noise
**Cons:** May miss interesting words in filtered captions; heuristics are imperfect

### C. Caption compression

Make each caption line shorter without losing information.

**Ideas:**

1. **Drop timestamps** — For pick-fill, timestamps aren't used by the LLM (we reconstruct from captionIndex). Saves ~8 chars/line.
2. **Drop English for pick-fill** — LLM only needs Korean to pick words; English can be omitted or sampled. Saves ~50% of caption data.
3. **Abbreviate format** — `[0] text1 | text2` instead of `[0] 0:25 | text1 | text2`
4. **Group short captions** — Merge consecutive short captions (< 10 chars) into single lines

**Pros:** No information loss (or minimal), no UX change
**Cons:** Limited savings alone (~30-50% reduction); doesn't solve the fundamental scaling issue

### D. Two-pass approach

First pass: LLM scans a compressed overview and identifies interesting regions. Second pass: app sends detailed captions for only those regions.

**Pass 1 prompt:**

- Compressed captions (Korean only, no timestamps, every-other-line sampled)
- Instruction: "List the caption index ranges that contain interesting vocabulary"
- Output: `[{ "start": 12, "end": 25 }, { "start": 80, "end": 95 }]`

**Pass 2 prompt:**

- Full captions for identified ranges only
- Normal pick-fill instructions

**Pros:** LLM focuses attention on interesting parts; minimal wasted context
**Cons:** Two round-trips per session; pass-1 quality depends on compressed view being representative

### E. Progressive UI with accumulated results

Instead of one big prompt, design the UX around incremental processing.

**Flow:**

1. App auto-chunks video into 5-min segments
2. UI shows a progress bar: "Segments: [✓] [✓] [○] [○] [○] [○]"
3. User clicks a segment → prompt is copied/downloaded for just that segment
4. User imports result → segment marked complete, bookmarks appear immediately
5. User can process segments in any order, skip boring parts

**Pros:** Natural for long videos; user sees progress; can stop early
**Cons:** More UI complexity; need to track per-segment state

### F. File upload workflow (already partially supported)

For large prompts, always use file download + upload instead of clipboard.

**Current state:** Download button exists but copy is the primary action.

**Enhancement:**

- Auto-detect when prompt > 20KB
- Hide copy button, show only download
- Add guidance text: "Prompt too large to copy. Download and upload to your LLM chat."
- Consider splitting into instruction file + data file for chat UIs that support multi-file upload

**Pros:** Avoids clipboard freezing; works today with most chat UIs
**Cons:** Doesn't solve LLM quality degradation from long context

### G. Hybrid: compression + chunking + progressive UI

Combine the best of multiple approaches:

1. **Always apply compression** (drop timestamps for pick-fill, skip music markers)
2. **Auto-chunk when compressed size > threshold** (e.g. 15KB / ~5K tokens)
3. **Show progressive UI** when chunked
4. **File download** when single chunk still > 20KB

This gives the best experience across video lengths:

- Short videos (< 10 min): single prompt, copy to clipboard — no change
- Medium videos (10-20 min): single prompt after compression, may fit in clipboard
- Long videos (20+ min): auto-chunked with progressive UI

## Recommendation

**Phase 1: Quick wins (compression + file-upload awareness)**

- Drop timestamps from pick-fill prompts (LLM doesn't need them)
- Skip music/silence marker captions
- Auto-switch to download-only when prompt > 20KB
- Show prompt size in UI: "Prompt: 12KB (~4K tokens)"

**Phase 2: Time-range chunking with progressive UI**

- Auto-chunk into 5-min segments when total > threshold
- Chunk navigator in AI prompt section
- Per-chunk copy/download + import
- Caption index offset handling on import
- Progress tracking (which chunks are done)

**Phase 3: Smart filtering (optional)**

- Two-pass approach for very long videos
- Caption deduplication
- Language complexity heuristics

## Key implementation details

### Caption index mapping for chunks

When chunking, each chunk's captions start at index 0 in the prompt but map to global indices. The prompt should include the global index to avoid mapping issues:

```
[142] 23:45 | 한국어 텍스트 | English text
[143] 23:48 | 다음 자막 | Next caption
```

This way the LLM returns `captionIndex: 142` which maps directly to the global array. No offset math needed.

### Chunk boundary handling

Words/phrases can span caption boundaries. Use overlapping chunks (e.g. 5-min chunks with 30s overlap) and deduplicate results by `captionIndex + text` on import.

### Size budget calculation

```typescript
const CLIPBOARD_LIMIT = 20_000; // bytes, switch to download-only
const CHUNK_TARGET = 15_000; // bytes per chunk
const INSTRUCTION_OVERHEAD = 1500; // bytes for template without captions

function getChunkCount(captionsSize: number): number {
  const dataSize = captionsSize + INSTRUCTION_OVERHEAD;
  if (dataSize <= CHUNK_TARGET) return 1;
  return Math.ceil(captionsSize / (CHUNK_TARGET - INSTRUCTION_OVERHEAD));
}
```

## Files to modify

- `src/lib/ai-prompt.ts` — chunking logic, compression, size calculation
- `src/lib/ai-prompt.md` — adjust templates (may need chunk-aware instructions)
- `src/components/caption-panel.tsx` — chunk navigator UI, progressive state, size display
- `e2e/dev-viewer.spec.ts` — tests for chunked prompts and multi-import

## Status

- **Phase**: Planning — awaiting feedback on approach direction
- **What's done**: Problem analysis, approach exploration, task doc
- **Next**: Get feedback on recommended approach, then implement Phase 1

## Feedback Log

(append user feedback here)
