---
name: zamak
description: >-
  Enrich Korean vocabulary bookmarks with translation, etymology, and notes
  via the window.__zamak browser API. Can also scan captions to pick new bookmarks.
---

# zamak skill

Enrich Korean vocabulary bookmarks on a zamak page. You run as an AI browser extension on a page with `window.__zamak` available.

Two modes:

1. **Fill** — user has already selected bookmarks, you fill translation/etymology/notes
2. **Pick + Fill** — you scan the full caption list, pick notable vocab, and fill metadata

## API Reference

```js
window.__zamak.getVideoContext()
// → { youtubeId, title, language1, language2 }

window.__zamak.getCaptions()
// → [{ idx, begin, end, text1 (Korean), text2 (English) }, ...]

window.__zamak.getBookmarks()
// → [{ id, text, context, captionContext, translation, etymology, notes }, ...]

window.__zamak.fillBookmark(id, { translation?, etymology?, notes? })
window.__zamak.fillBookmarks([{ id, translation?, etymology?, notes? }, ...])
```

## Mode 1: Fill Existing Bookmarks

### Step 1: Read

```js
const bookmarks = window.__zamak.getBookmarks();
const video = window.__zamak.getVideoContext();
```

Each bookmark has:

- `text` — the Korean word/phrase as it appears in the subtitle
- `context` — the full caption line containing the word
- `captionContext` — surrounding caption rows (Korean `text1` + English `text2`), typically 3 rows
- `translation`, `etymology`, `notes` — empty fields to fill

### Step 2: Fill & write

For each bookmark, determine translation/etymology/notes (see [Field Guidelines](#field-guidelines)), then write:

```js
window.__zamak.fillBookmarks([
  { id: "...", translation: "...", etymology: "...", notes: "..." },
  // ...
]);
```

### Step 3: Verify

```js
window.__zamak.getBookmarks();
```

Report: how many filled, any skipped/uncertain.

## Mode 2: Pick + Fill from Captions

When the user asks you to pick vocabulary from the captions (no existing bookmarks, or wants more).

### Step 1: Read captions

```js
const captions = window.__zamak.getCaptions();
const video = window.__zamak.getVideoContext();
```

### Step 2: Pick notable vocab

Scan through `text1` (Korean) of each caption. Pick words/phrases that are:

- **Intermediate level or above** — skip basic greetings, particles, ultra-common verbs (하다/가다/오다)
- **Slang, colloquial, internet-speak** that textbooks don't teach
- **Hanja-based words** where etymology aids memorization
- **Context-dependent meanings** where the same word means something different than usual

Target: ~1 bookmark per 10 seconds of video duration. Err on over-picking — user can delete.

### Step 3: Present to user

**Do not call fillBookmarks yet.** Present your picks as a list for user review:

```
Found N notable words in [video title]:

1. 헷갈리다 (caption 4: "아직 좀 헷갈리기는 해") — to be confused
2. 비현실적 (caption 12: "너무 비현실적이야 이게") — surreal
3. ...

Should I proceed to fill these? You can also tell me to add/remove specific words.
```

The user creates bookmarks manually (text selection in the caption panel). Once they've selected their picks, switch to Mode 1 to fill the metadata.

## Field Guidelines

| Field         | What to write                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `translation` | Contextual English meaning — what it means **in this caption**, not a dictionary dump. Concise.                                                  |
| `etymology`   | Hanja breakdown if applicable (e.g. `非現實的; 비(non) + 현실(reality) + 적(adj)`). Empty for native Korean words where etymology adds no value. |
| `notes`       | Usage tips: formality, collocations, contrasting words, gotchas. 1-2 sentences max. Empty if nothing notable beyond the translation.             |

### Principles

- **Use caption context.** The `captionContext` / `text2` gives English context to disambiguate.
- **Be concise.** Flashcard-style, not dictionary entries.
- **Contextual over generic.** "to get confused" not "1. to be confused 2. to mix up 3. to be ambiguous".
- **Etymology for memorization.** `약속(約束); 약(promise) + 속(bind)` is useful. Don't force it for native words.
- **Notes for gaps.** Things a dictionary won't say: "informal, only among close friends", "often confused with X".

## Examples

### Fill example

**Input:**

```json
{
  "id": "abc-123",
  "text": "헷갈리다",
  "context": "아직 좀 헷갈리기는 해",
  "captionContext": [
    { "text1": "이게 현실인지 꿈인지", "text2": "Is this real or a dream?" },
    { "text1": "아직 좀 헷갈리기는 해", "text2": "I'm still a bit confused" },
    { "text1": "그래도 기분은 좋아", "text2": "But I feel good" }
  ]
}
```

**Output:**

```json
{
  "id": "abc-123",
  "translation": "to be confused, can't tell apart",
  "etymology": "",
  "notes": "Conjugated as 헷갈리기는 해 (softened acknowledgment). Common in spoken Korean."
}
```

### Fill example (Hanja word)

**Input:**

```json
{
  "id": "def-456",
  "text": "비현실적",
  "context": "너무 비현실적이야 이게",
  "captionContext": [
    { "text1": "말도 안 돼", "text2": "No way" },
    { "text1": "너무 비현실적이야 이게", "text2": "This is so surreal" },
    { "text1": "진짜?", "text2": "For real?" }
  ]
}
```

**Output:**

```json
{
  "id": "def-456",
  "translation": "surreal, unrealistic",
  "etymology": "非現實的; 비(non) + 현실(reality) + 적(adj)",
  "notes": ""
}
```

## Eval Checklist

| Dimension               | Good                                       | Bad                                                 |
| ----------------------- | ------------------------------------------ | --------------------------------------------------- |
| Translation accuracy    | Matches the specific context               | Generic dictionary definition                       |
| Translation conciseness | "to get confused"                          | "1. to be confused 2. to mix up 3. to be ambiguous" |
| Etymology usefulness    | Hanja breakdown that aids memorization     | Repeating the translation in etymology field        |
| Etymology restraint     | Empty for native Korean words              | Forced/invented etymology for every word            |
| Notes relevance         | Formality, usage pattern, common confusion | Restating the translation or obvious grammar        |
| Notes restraint         | Empty when translation says it all         | Filler notes for every single bookmark              |
| Completion              | All bookmarks addressed                    | Silently skipped some                               |
