# --- pick-fill ---

# Task: Pick Korean vocabulary & fill metadata

You are helping me learn Korean from a YouTube video. Scan the captions below and pick {{TARGET}} interesting vocabulary words worth learning.

## What to pick

- Intermediate+ level (skip basic words like 하다/가다/오다, particles, greetings)
- Slang, colloquial, internet-speak
- Hanja-based words where etymology aids memorization
- Context-dependent meanings

## Output format (CRITICAL)

Your ENTIRE response must be a single JSON code block. No prose, no tables, no explanations outside the JSON. The output is machine-parsed — anything outside the code fence will cause an error.

Each entry:

- `captionIndex`: the [idx] from captions above
- `text`: exact substring from the Korean column (no speaker labels like [나경])
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: Hanja if applicable (e.g. "體重"). Empty string for native Korean words.

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
