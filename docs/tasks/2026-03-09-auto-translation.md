# Auto-Translated English from Auto-Transcribed Korean

**Test video:** https://www.youtube.com/watch?v=aK8Yh3RTBUY (Korean-only, no English track)

## Problem

Many Korean YouTube videos only have auto-generated Korean captions (ASR) — no English track. YouTube supports auto-translation via `&tlang=<code>` on caption baseUrls. This works on our mobile client baseUrls (same POT workaround we already use). No new access issues.

## Findings

### Fetching works

- `&tlang=en` on mobile baseUrl returns valid JSON3, same structure as original
- `parseJson3()` works unchanged on translated data
- Translation quality: rough but usable for language learning (informal register preserved, names transliterated)

### Event-level alignment is near-perfect

```
Korean cue events:  215 (non-empty)
English cue events: 182 (non-empty)
Matched by tStartMs: 182/215 (85%, all English events match a Korean one)
```

The 33 unmatched Korean events have no English counterpart (translation dropped them — typically filler). Non-issue for merge.

### Word-level cues blow up merge

After `parseJson3()` word splitting: Korean → 912 cues, English → 1364 cues. Partition strategy pairs individual words against each other — unusable.

## Phase 1 (done): translation fetching + band-aid merge

Initial implementation with `eventLevel` flag on `parseJson3()`:

- [x] `scrape-youtube.ts`: fetches translated tracks, prefers manual source over ASR
- [x] `fetchPlayerApi()`: generates virtual translated tracks with `&tlang=` in URL
- [x] `parseJson3(data, { eventLevel })`: forces event-level cues when flag set
- [x] `CaptionPanel`: detects translated tracks via `isTranslatedTrack()`, threads `eventLevel` through `fetchCues`
- [x] `TrackPicker`: labels translated tracks as "(translated)"
- [x] Test fixture: `scripts/youtube-json/aK8Yh3RTBUY/`
- [x] Merge tests for translated track pair

## Phase 2 (next): refactor pipeline — merge owns parsing decisions

The `eventLevel` plumbing is a band-aid. The caller (CaptionPanel) shouldn't decide how to parse — the merge layer should, since it knows the track relationship.

### Current pipeline

```
                    caller decides eventLevel
                            ↓
Json3 → parseJson3(eventLevel?) → CaptionCue[] → mergeCaptions(cues1, cues2)
```

Problems:

- `parseJson3` is lossy — word splitting destroys event boundaries, event-level loses word timing
- Caller must detect track types and set `eventLevel` — logic split across layers
- `eventLevel` flag threaded through `fetchCues`, `CaptionPanel`, `content.tsx`, `dev-viewer.tsx`

### Proposed pipeline

```
Json3 → mergeCaptions({ json3, vssId }, { json3, vssId }) → MergeResult
```

The merge layer receives raw JSON3 + vssId, and internally decides:

1. How to parse (event-level always — word timing preserved as nested data)
2. Which strategy to use (based on vssId relationship)

### Key changes

**1. `parseJson3()` always produces event-level cues**

One `CaptionEvent` per JSON3 event, with word timing preserved as nested data:

```typescript
interface CaptionEvent {
  begin: number;
  end: number;
  text: string; // joined segments (for merge/display)
  words?: CaptionWord[]; // word-level timing within event (for future use)
}

interface CaptionWord {
  text: string;
  begin: number;
  end: number;
}
```

No more `eventLevel` flag. The "event-level" branch becomes the only path.

**2. `mergeCaptions()` takes raw JSON3 + vssId**

```typescript
interface TrackInput {
  json3: Json3File;
  vssId: string;
}

function mergeCaptions(
  track1: TrackInput,
  track2: TrackInput,
  forceStrategy?: MergeStrategy,
): MergeResult;
```

Internally it parses both tracks, then selects strategy based on vssId:

| vssId relationship                       | Example              | Strategy                   |
| ---------------------------------------- | -------------------- | -------------------------- |
| Translated pair (one is prefix of other) | `a.ko` + `a.ko.t.en` | strict (shared `tStartMs`) |
| Manual + manual, same count              | `.ko` + `.en`        | strict / relaxed-strict    |
| Manual + ASR, or count mismatch          | `.ko` + `a.ko`       | partition                  |
| Fallback                                 | any                  | partition                  |

**3. Remove `eventLevel` plumbing**

Delete from:

- `parseJson3()` opts parameter
- `isTranslatedTrack()` helper (merge uses vssId directly)
- `CaptionPanel` `useEventLevel` logic
- `fetchCues` opts in `content.tsx`, `dev-viewer.tsx`

**4. Callers simplify**

```typescript
// CaptionPanel fetchCues becomes just fetching JSON3
fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;

// Merge call
mergeCaptions(
  { json3: json3_1, vssId: sel1.vssId },
  { json3: json3_2, vssId: sel2.vssId },
);
```

### What stays unchanged

- All merge strategy algorithms (strict, partition, DTW, etc.) — same logic, just input type changes from `CaptionCue` to `CaptionEvent`
- `MergedCaption` output shape
- Track fetching, track picker, extension injection
- `fetchPlayerApi()` translated track generation

## Reference files

- `src/lib/youtube.ts` — `parseJson3()`, `fetchPlayerApi()`, `fetchTrackJson3()`
- `src/lib/caption-merge.ts` — merge strategies, `mergeCaptions()`
- `src/lib/caption-merge.test.ts` — merge tests (will need snapshot updates)
- `src/components/caption-panel.tsx` — CaptionPanel (fetchCues → fetchJson3)
- `src/extension/content.tsx` — extension fetchCues
- `src/routes/dev-viewer.tsx` — dev fixture loading

## Status

- **Phase 1:** Done (on `feat/auto-translation` branch, PR #77)
- **Phase 2:** Plan written, pending approval
