---
name: zamak-fill
description: >-
  Fill translation, etymology, and notes for Korean vocabulary bookmarks
  via the window.__zamak browser API.
---

# zamak-fill skill

Fill translation, etymology, and notes for Korean vocabulary bookmarks on a zamak page. The bookmarks were created by a user selecting Korean words while watching YouTube with dual captions. Your job is to enrich each bookmark with useful study metadata.

## Context

You are running as an AI browser extension (e.g. Claude for Chrome) on a page that has the `window.__zamak` API available. The user has already selected Korean words/phrases from YouTube subtitles as bookmarks. Each bookmark has the Korean text and surrounding caption context (Korean + English). You fill in the missing fields.

## Procedure

### Step 1: Read bookmarks

```js
const bookmarks = window.__zamak.getBookmarks();
const video = window.__zamak.getVideoContext();
```

Review the bookmarks. Each has:

- `id` — unique identifier
- `text` — the Korean word/phrase as it appears in the subtitle
- `context` — the full caption line containing the word
- `captionContext` — array of surrounding caption rows (Korean `text1` + English `text2`), typically 3 rows (1 before, the bookmark's row, 1 after)
- `translation`, `etymology`, `notes` — currently empty, your job to fill

### Step 2: Fill metadata

For each bookmark, determine:

| Field         | What to write                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translation` | Contextual English meaning. Not a dictionary dump — what does it mean **in this specific caption**? Keep it concise.                                                                                                                         |
| `etymology`   | Hanja breakdown if applicable (e.g. `非現實的; 비(non) + 현실(reality) + 적(adj)`). For native Korean words or slang, explain word formation or origin. Leave empty if etymology adds no learning value (e.g. basic native words like 하다). |
| `notes`       | Usage notes that help a learner: formality level (formal/informal/slang), common collocations, similar/contrasting words, or gotchas. Keep it to 1-2 sentences. Leave empty if there's nothing notable beyond the translation.               |

### Guidelines

- **Use the caption context.** The `captionContext` array gives you the Korean and English lines around the bookmark. Use the English translation to disambiguate meaning. Use the Korean context to understand usage.
- **Be concise.** These are flashcard-style study notes, not dictionary entries. One line per field is ideal.
- **Contextual translation over dictionary translation.** "to get confused" is better than "1. to be confused 2. to be mixed up 3. to be ambiguous" — pick the meaning that fits.
- **Etymology is for memorization.** Hanja breakdowns help Korean learners remember words. `약속(約束); 약(promise) + 속(bind)` is useful. But don't force it — skip for common native Korean words.
- **Notes are for the gaps.** Things a dictionary won't tell you: "informal, only used among close friends", "often confused with X", "the 요 form sounds awkward here, 해요 is more natural".

### Step 3: Write results

Call `fillBookmarks` with all entries at once:

```js
window.__zamak.fillBookmarks([
  {
    id: "bookmark-id-1",
    translation: "to get confused",
    etymology: "",
    notes: "Casual/informal. Often used as 헷갈려 in speech.",
  },
  {
    id: "bookmark-id-2",
    translation: "unrealistic, surreal",
    etymology: "非現實的; 비(non) + 현실(reality) + 적(adj suffix)",
    notes: "",
  },
  // ... all bookmarks
]);
```

### Step 4: Verify

```js
window.__zamak.getBookmarks();
```

Confirm all bookmarks now have filled fields. Report a summary to the user:

- How many bookmarks were filled
- Any bookmarks you skipped or were unsure about

## Examples

### Input bookmark

```json
{
  "id": "abc-123",
  "text": "헷갈리다",
  "context": "아직 좀 헷갈리기는 해",
  "captionContext": [
    { "text1": "이게 현실인지 꿈인지", "text2": "Is this real or a dream?" },
    { "text1": "아직 좀 헷갈리기는 해", "text2": "I'm still a bit confused" },
    { "text1": "그래도 기분은 좋아", "text2": "But I feel good" }
  ],
  "translation": "",
  "etymology": "",
  "notes": ""
}
```

### Output

```json
{
  "id": "abc-123",
  "translation": "to be confused, can't tell apart",
  "etymology": "",
  "notes": "Conjugated as 헷갈리기는 해 (softened acknowledgment). Common in spoken Korean."
}
```

### Input bookmark (Hanja word)

```json
{
  "id": "def-456",
  "text": "비현실적",
  "context": "너무 비현실적이야 이게",
  "captionContext": [
    { "text1": "말도 안 돼", "text2": "No way" },
    { "text1": "너무 비현실적이야 이게", "text2": "This is so surreal" },
    { "text1": "진짜?", "text2": "For real?" }
  ],
  "translation": "",
  "etymology": "",
  "notes": ""
}
```

### Output

```json
{
  "id": "def-456",
  "translation": "surreal, unrealistic",
  "etymology": "非現實的; 비(non) + 현실(reality) + 적(adj)",
  "notes": ""
}
```

## Eval Checklist

After filling, review quality against these dimensions:

| Dimension               | Good                                       | Bad                                                 |
| ----------------------- | ------------------------------------------ | --------------------------------------------------- |
| Translation accuracy    | Matches the specific context               | Generic dictionary definition                       |
| Translation conciseness | "to get confused"                          | "1. to be confused 2. to mix up 3. to be ambiguous" |
| Etymology usefulness    | Hanja breakdown that aids memorization     | Repeating the translation in etymology field        |
| Etymology restraint     | Empty for native Korean words              | Forced/invented etymology for every word            |
| Notes relevance         | Formality, usage pattern, common confusion | Restating the translation or obvious grammar        |
| Notes restraint         | Empty when translation says it all         | Filler notes for every single bookmark              |
| Completion              | All bookmarks addressed                    | Silently skipped some                               |
