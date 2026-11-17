# --- pick-fill ---

# Task: Pick Korean vocabulary & fill metadata

You are helping me learn Korean from a YouTube video. Scan the captions below and pick interesting vocabulary words worth learning.

## What to pick

- Words a Korean learner is unlikely to already know (from upper intermediate to TOPIK2 class vocabulary)
- Prefer single words over phrases — pick the word itself, not the surrounding expression
- Skip: beginner vocabulary, basic/common words (하다, 가다, 있다, particles, greetings), transparent English loanwords (포인트, 스타일)
- Aim for 5-10 picks per ~150 captions. Prefer fewer quality picks over padding.

## Splitting

If there are more than 150 captions, process ~150 at a time. After each batch, output your picks as a JSON code block, state where you stopped, and ask the user to say "continue".

## Output format

Output your picks as one JSON code block. The app reads the first fenced block, so you may add a short comment outside it.

Each entry:

- `captionIndex`: the [idx] from captions above
- `text`: exact substring from the Korean column
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: the word's origin or structure when it helps learning, otherwise an empty string. Minimal format, no explanations:
  - Sino-Korean: Hanja, followed by Japanese kanji when they differ (`價格 / 価格`, `希望`)
  - auxiliary verb compounds: `잊다 + 버리다`
  - passive, causative, and nominalization: `듣다 + 리 (passive)`, `웃다 + 기 (causative)`, `걷다 + 음 (nominalization)`
  - compounds, with each root before sound change: `개 + 아지` for 강아지, `갈비 + 湯` for 갈비탕
  - loanwords, with the borrowing path: `computer`, `アルバイト / Arbeit`
  - contractions: the full form, such as `아이` for 애
  - Leave it empty for native words with no analyzable structure (가다, 좋다), obvious splits (숨소리 is 숨 + 소리), and origins that aren't established. Don't guess a folk etymology.
- `notes`: a short usage note when it helps, otherwise an empty string. Useful notes include:
  - the grammar pattern behind a pick that isn't a single word, such as -ㄹ수록 ("the more ...") in 조용할수록
  - a contrast with a similar form
  - related words, each tagged by what it is: `(.syn)` synonym, `(.ant)` antonym, `(.hon)` honorific form, `(.syn:native)` 순우리말 equivalent, `(.syn:casual)` or `(.syn:formal)` register variant. Separate multiple words with commas. Skip inflection pairs (닫히다 → 닫다) and contractions (뭐 → 무엇).

```json
[
  {
    "captionIndex": 4,
    "text": "체중",
    "translation": "body weight",
    "etymology": "體重 / 体重",
    "notes": "몸무게 (.syn:native)"
  },
  {
    "captionIndex": 12,
    "text": "어이없다",
    "translation": "absurd, dumbfounded",
    "etymology": "",
    "notes": ""
  }
]
```

## Video

Title: {{TITLE}}

## Captions

{{CAPTIONS}}

# --- fill ---

# Task: Fill bookmark metadata

You are helping me learn Korean from a YouTube video. Fill translation and metadata for the bookmarks below.

## Output format

Output the entries as one JSON code block. The app reads the first fenced block, so you may add a short comment outside it.

Each entry:

- `id`: the bookmark id from above
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: the word's origin or structure when it helps learning, otherwise an empty string. Minimal format, no explanations:
  - Sino-Korean: Hanja, followed by Japanese kanji when they differ (`價格 / 価格`, `希望`)
  - auxiliary verb compounds: `잊다 + 버리다`
  - passive, causative, and nominalization: `듣다 + 리 (passive)`, `웃다 + 기 (causative)`, `걷다 + 음 (nominalization)`
  - compounds, with each root before sound change: `개 + 아지` for 강아지, `갈비 + 湯` for 갈비탕
  - loanwords, with the borrowing path: `computer`, `アルバイト / Arbeit`
  - contractions: the full form, such as `아이` for 애
  - Leave it empty for native words with no analyzable structure (가다, 좋다), obvious splits (숨소리 is 숨 + 소리), and origins that aren't established. Don't guess a folk etymology.
- `notes`: a short usage note when it helps, otherwise an empty string. Useful notes include:
  - the grammar pattern behind a pick that isn't a single word, such as -ㄹ수록 ("the more ...") in 조용할수록
  - a contrast with a similar form
  - related words, each tagged by what it is: `(.syn)` synonym, `(.ant)` antonym, `(.hon)` honorific form, `(.syn:native)` 순우리말 equivalent, `(.syn:casual)` or `(.syn:formal)` register variant. Separate multiple words with commas. Skip inflection pairs (닫히다 → 닫다) and contractions (뭐 → 무엇).

```json
[
  {
    "id": "abc-123",
    "translation": "to be confused",
    "etymology": "",
    "notes": ""
  }
]
```

## Video

Title: {{TITLE}}

## Bookmarks to fill

Each bookmark's `captionIndex` is the [idx] of its line in the captions below. Read the lines around it before filling, because the sense, the Hanja, and any joke often depend on the scene rather than on that one line.

{{BOOKMARKS}}

## Captions (for context)

{{CAPTIONS}}

# --- fix-asr ---

# Task: Fix and align Korean ASR captions

You are an agent with a shell and `yt-dlp`. This video's Korean captions are auto-generated (ASR). Fix the Korean and align it to an official track, so each row pairs one Korean line with its English line.

## Steps

Read this guide and follow it:

https://raw.githubusercontent.com/hi-ogawa/ytsub-v5/main/docs/generate-import-json.md

Run "Fetch and Assess" to get the tracks, then produce `captions.json` as Scenario B describes. Instead of picking bookmarks, re-anchor the existing bookmarks below to your new rows, as "Re-anchor Existing Bookmarks" describes, and keep each bookmark's `id` in `bookmarks.json`. Skip "Assemble import.json".

## Video

ID: {{VIDEO_ID}}
Title: {{TITLE}}

## Tracks the app sees

{{TRACKS}}

The app's list can miss official tracks, so check `yt-dlp --list-subs` too.

## Existing bookmarks

`captionIndex` points into the current rows, and `context` is the current row text, which shows where each word was before your changes. `side` is 0 for a Korean word and 1 for an English one.

{{ANCHOR_BOOKMARKS}}

## Output format

Write the result as one JSON file, and tell me its path. I paste its contents into the app, which replaces all caption rows and moves each bookmark to its new position.

```json
{
  "captions": [{ "begin": 1.2, "end": 3.4, "text1": "...", "text2": "..." }],
  "bookmarks": [
    { "id": "...", "captionIndex": 5, "offset": 3, "text": "쌍꺼풀" }
  ]
}
```

- `captions`: the rows of `captions.json` in order, with `begin` and `end` in seconds.
- `bookmarks`: the validated `bookmarks.json`, one entry for each existing bookmark, with `id`, `text`, `offset`, and `captionIdx` renamed to `captionIndex`. `text` is the word as it reads now, which can differ from before when you fixed it.

The app rejects the whole result if any bookmark is missing or its `text` isn't at its `offset`.
