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

Output your picks as a JSON code block. You may include brief commentary outside the code block.

Each entry:

- `captionIndex`: the [idx] from captions above
- `text`: exact substring from the Korean column
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: Hanja if applicable. Empty string for native Korean words.

```json
[
  {
    "captionIndex": 4,
    "text": "체중",
    "translation": "body weight",
    "etymology": "體重"
  },
  {
    "captionIndex": 12,
    "text": "어이없다",
    "translation": "absurd, dumbfounded",
    "etymology": ""
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

## Output format (CRITICAL)

Your ENTIRE response must be a single JSON code block. No prose, no tables, no explanations outside the JSON. The output is machine-parsed — anything outside the code fence will cause an error.

Each entry:

- `id`: the bookmark id from above
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: Hanja if applicable (e.g. "體重"). Empty string for native Korean words.

```json
[
  {
    "id": "abc-123",
    "translation": "to be confused",
    "etymology": ""
  }
]
```

## Video

Title: {{TITLE}}

## Bookmarks to fill

{{BOOKMARKS}}

## Captions (for context)

{{CAPTIONS}}

# --- fix-asr ---

# Task: Fix Korean ASR subtitles

You are helping me fix auto-generated Korean subtitles. The English column is manually written and accurate — use it as your anchor.

Fix: misheard syllables, wrong spacing, `>>` markers, truncated words, repeated fragments.
Do NOT fix: correct casual/informal Korean, filler words, stylistic choices.
If unsure about a correction, skip it and mention it separately.

## Output format (CRITICAL)

Your ENTIRE response must be a single JSON code block. No prose, no tables, no explanations outside the JSON. The output is machine-parsed — anything outside the code fence will cause an error.

Include ONLY the rows that need fixing:

```json
[{ "idx": 3, "text1": "두바이 쿠키 먹어봤어?" }]
```

## Video

Title: {{TITLE}}

## Captions

{{CAPTIONS}}
