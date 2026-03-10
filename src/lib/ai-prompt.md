# --- pick-fill ---

# Task: Pick Korean vocabulary & fill metadata

You are helping me learn Korean from a YouTube video. Scan the captions below and pick {{TARGET}} interesting vocabulary words worth learning.

## What to pick

- Intermediate+ level (skip basic words like 하다/가다/오다, particles, greetings)
- Slang, colloquial, internet-speak
- Hanja-based words where etymology aids memorization
- Context-dependent meanings

## Video

Title: {{TITLE}}

## Captions

{{CAPTIONS}}

## Output

Return a single JSON code block. Each entry:

- `captionIndex`: the [idx] from captions above
- `text`: exact substring from the Korean column (no speaker labels like [나경])
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: Hanja breakdown if it aids memorization (e.g. "非現實的; 비(non) + 현실(reality) + 적(adj)"). Empty string for native Korean words.
- `notes`: usage tips — formality, collocations, gotchas. 1-2 sentences max. Empty string if nothing notable.

```json
[
  {
    "captionIndex": 4,
    "text": "헷갈리다",
    "translation": "to be confused",
    "etymology": "",
    "notes": "Conjugated as 헷갈리기는 해 (softened)."
  }
]
```

# --- fill ---

# Task: Fill bookmark metadata

You are helping me learn Korean from a YouTube video. Fill translation and metadata for the bookmarks below.

## Video

Title: {{TITLE}}

## Bookmarks to fill

{{BOOKMARKS}}

## Captions (for context)

{{CAPTIONS}}

## Output

Return a single JSON code block. Each entry:

- `id`: the bookmark id from above
- `translation`: contextual English meaning for this caption, not a dictionary dump. Concise.
- `etymology`: Hanja breakdown if it aids memorization (e.g. "非現實的; 비(non) + 현실(reality) + 적(adj)"). Empty string for native Korean words.
- `notes`: usage tips — formality, collocations, gotchas. 1-2 sentences max. Empty string if nothing notable.

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

# --- fix-asr ---

# Task: Fix Korean ASR subtitles

You are helping me fix auto-generated Korean subtitles. The English column is manually written and accurate — use it as your anchor.

Fix: misheard syllables, wrong spacing, `>>` markers, truncated words, repeated fragments.
Do NOT fix: correct casual/informal Korean, filler words, stylistic choices.
If unsure about a correction, skip it and mention it separately.

## Video

Title: {{TITLE}}

## Captions

{{CAPTIONS}}

## Output

Return a single JSON code block with ONLY the rows that need fixing:

```json
[{ "idx": 3, "text1": "두바이 쿠키 먹어봤어?" }]
```
