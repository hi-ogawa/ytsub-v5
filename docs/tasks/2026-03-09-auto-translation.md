# Auto-Translated English from Auto-Transcribed Korean

**Test video:** https://www.youtube.com/watch?v=aK8Yh3RTBUY (Korean-only, no English track)

## Problem

Many Korean YouTube videos only have auto-generated Korean captions (ASR) — no English track. YouTube supports auto-translation via `&tlang=<code>` on caption baseUrls. This works on our mobile client baseUrls (same POT workaround we already use). No new access issues.

Currently `parseJson3()` splits ASR events into word-level cues (via `tOffsetMs`). This is fine when merging word-level ASR against sentence-level manual subs, but when both tracks are from the same ASR source (original + translation), both produce word-level cues and the merge breaks down.

The fix is straightforward: since translated tracks are direct translations, JSON3 events align 1:1 at the **event level** (`tStartMs`). We should merge at event granularity rather than word granularity for this case.

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

Side-by-side at event level:

```
[0.3s]  ko: 그래 가지고 이렇게 라이브를
        en: So, I turned on the live broadcast like this

[9.4s]  ko: 이제 타이페이 콘서트 뭐
        en: Now, Taipei concert, what the heck, my

[38.2s] ko: 근데 썸팅끼리 먹었단 말이에요.
        en: But I'm saying that we ate together as a couple.
```

The 33 unmatched Korean events have no English counterpart (translation dropped them — typically filler/empty). This is a non-issue for merge.

### Word-level cues blow up merge

After `parseJson3()` word splitting: Korean → 912 cues, English → 1364 cues. Partition strategy pairs individual words against each other — unusable.

## Implementation plan

### 1. Refactor `parseJson3()` to support event-level output

Current `parseJson3()` always splits to word-level cues when `tOffsetMs` is present. Add an option (or a separate function) that produces **event-level cues** — one cue per JSON3 event, joining all segments into a single text string. This is what the `else` (no-offsets) branch already does.

This is the key change. The rest of the pipeline (merge, display) works as-is once cues are at the right granularity.

### 2. Use event-level parsing for translated track pairs

When both tracks are from the same ASR source (original + `&tlang` translation), parse both at event level. Detection: translated tracks have vssId like `a.ko.t.en` (contains `.t.`).

### 3. Generate virtual translated tracks in extension

In `fetchPlayerApi()` (or a wrapper), for translatable ASR tracks, generate `YouTubeCaptionTrack` entries with `&tlang=<code>` baked into `baseUrl`. Hard-code target languages (e.g., `ko → [en, ja]`) — same approach as `scrape-youtube.ts`.

### 4. Show in TrackPicker

Translated tracks appear with "(auto-translated)" label. No other UI changes needed.

## Reference files

- `src/lib/youtube.ts` — `parseJson3()`, `fetchPlayerApi()`, `fetchTrackJson3()`
- `src/lib/caption-merge.ts` — merge strategies (no changes expected)
- `scripts/scrape-youtube.ts` — fixture scraper (already updated with translation support)
- `src/components/track-picker.tsx` — track selector UI
- `src/components/caption-panel.tsx` — track persistence, cue fetching

## Done

- [x] Probed API: `&tlang=en` works on mobile baseUrls
- [x] Verified JSON3 structure identical, event-level 1:1 alignment confirmed
- [x] `scrape-youtube.ts` updated: fetches translated tracks, prefers manual source over ASR
- [x] Test fixture: `scripts/youtube-json/aK8Yh3RTBUY/` (ko ASR + en/ja translations)

## Remaining

- [ ] Refactor `parseJson3()` — event-level output option
- [ ] Wire up event-level parsing for translated track pairs
- [ ] Generate virtual translated tracks in extension
- [ ] TrackPicker UI for translated tracks
