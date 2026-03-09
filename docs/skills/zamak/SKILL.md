---
name: zamak
description: >-
  AI browser extension tasks for zamak (Korean language learning from YouTube).
  Correct ASR captions, fill bookmark metadata, pick vocabulary — all via window.__zamak.
---

# zamak skill

Tasks for AI browser extensions running on a zamak page with `window.__zamak` available. Each task can be invoked independently.

| Task                                     | When                                               |
| ---------------------------------------- | -------------------------------------------------- |
| [Fix Korean ASR](#task-fix-korean-asr)   | Korean captions are auto-generated (garbled/noisy) |
| [Fill Bookmarks](#task-fill-bookmarks)   | User has selected bookmarks, needs metadata filled |
| [Pick Vocabulary](#task-pick-vocabulary) | User wants vocab suggestions from the caption list |

## API Reference

```js
// Read
window.__zamak.getVideoContext()
// → { youtubeId, title, language1, language2 }

window.__zamak.getCaptions()
// → [{ idx, begin, end, text1 (Korean), text2 (English) }, ...]

window.__zamak.getBookmarks()
// → [{ id, text, context, captionContext, translation, etymology, notes }, ...]

// Write
window.__zamak.updateCaptions([{ idx, text1?, text2? }, ...])
window.__zamak.fillBookmarks([{ id, translation?, etymology?, notes? }, ...])
```

---

## Task: Fix Korean ASR

Fix auto-generated Korean subtitle text using the English manual translation as reference.

### When to use

When `text1` (Korean) is auto-generated (ASR) and `text2` (English) is manual. The Korean has typical ASR artifacts: misheard syllables, wrong spacing, `>>` speaker markers, truncated words at cue boundaries.

### Step 1: Read captions

```js
const captions = window.__zamak.getCaptions();
const video = window.__zamak.getVideoContext();
```

### Step 2: Identify and fix issues

Scan each caption's `text1` (Korean ASR) against `text2` (English manual). Look for:

| Issue                | Example                          | Fix                    |
| -------------------- | -------------------------------- | ---------------------- |
| Misheard syllables   | "두정" → should be "두바이 쿠키" | Use English + context  |
| Wrong spacing        | "악몽꽃" → "악몽 꿨어"           | Natural Korean spacing |
| `>>` speaker markers | ">> 안녕하세요"                  | Remove `>>`            |
| Truncated words      | "안녕하" (cut off at cue edge)   | Complete the word      |
| Repeated fragments   | Same phrase duplicated           | Deduplicate            |

### Guidelines

- **English is your anchor.** The manual English translation tells you what was actually said. Use it to decode garbled Korean.
- **Fix only what's wrong.** Don't rephrase correct Korean — preserve the original wording. ASR often gets common words right.
- **Preserve natural speech.** Keep filler words (어, 아, 음), contractions, and informal speech patterns — they're part of the content.
- **When unsure, leave it.** If you can't confidently determine the correct Korean from context, leave the original. Flag it to the user.

### Step 3: Write corrections

```js
window.__zamak.updateCaptions([
  { idx: 3, text1: "두바이 쿠키 먹어봤어?" },
  { idx: 7, text1: "악몽 꿨어 어젯밤에" },
  // ... only the rows that need fixing
]);
```

Only include rows that actually need changes.

### Step 4: Report

Tell the user:

- How many captions were corrected out of total
- Any captions you flagged as uncertain
- Summary of common issues found (e.g. "mostly spacing fixes, 3 misheard words")

---

## Task: Fill Bookmarks

Fill translation, etymology, and notes for existing bookmarks.

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

---

## Task: Pick Vocabulary

Scan captions and suggest notable vocabulary for the user to bookmark.

### Step 1: Read captions

```js
const captions = window.__zamak.getCaptions();
const video = window.__zamak.getVideoContext();
```

### Step 2: Pick notable vocab

Scan `text1` (Korean) of each caption. Pick words/phrases that are:

- **Intermediate level or above** — skip basic greetings, particles, ultra-common verbs (하다/가다/오다)
- **Slang, colloquial, internet-speak** that textbooks don't teach
- **Hanja-based words** where etymology aids memorization
- **Context-dependent meanings** where the same word means something different than usual

Target: ~1 bookmark per 10 seconds of video duration. Err on over-picking — user can delete.

### Step 3: Present to user

**Do not call any write API.** Present your picks as a list for user review:

```
Found N notable words in [video title]:

1. 헷갈리다 (caption 4: "아직 좀 헷갈리기는 해") — to be confused
2. 비현실적 (caption 12: "너무 비현실적이야 이게") — surreal
3. ...

Should I proceed? You can add/remove words, then select them in the caption panel.
```

The user creates bookmarks manually (text selection in the caption panel). Once selected, switch to Fill Bookmarks task.

---

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

---

## Examples

### ASR fix example

**Before:**

```json
{
  "idx": 3,
  "text1": "두정 먹어봤어?",
  "text2": "Have you tried Dubai cookies?"
}
```

**After:**

```js
window.__zamak.updateCaptions([{ idx: 3, text1: "두바이 쿠키 먹어봤어?" }]);
```

### Bookmark fill example

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

### Bookmark fill example (Hanja word)

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

---

## Eval Checklist

### ASR Correction

| Dimension    | Good                           | Bad                                 |
| ------------ | ------------------------------ | ----------------------------------- |
| Accuracy     | Matches what was actually said | Invented plausible but wrong Korean |
| Restraint    | Only changed broken text       | Rewrote correct casual speech       |
| Completeness | Found all garbled words        | Missed obvious errors               |
| Uncertainty  | Flagged unclear cases          | Guessed silently                    |

### Bookmark Fill

| Dimension               | Good                                       | Bad                                                 |
| ----------------------- | ------------------------------------------ | --------------------------------------------------- |
| Translation accuracy    | Matches the specific context               | Generic dictionary definition                       |
| Translation conciseness | "to get confused"                          | "1. to be confused 2. to mix up 3. to be ambiguous" |
| Etymology usefulness    | Hanja breakdown that aids memorization     | Repeating the translation in etymology field        |
| Etymology restraint     | Empty for native Korean words              | Forced/invented etymology for every word            |
| Notes relevance         | Formality, usage pattern, common confusion | Restating the translation or obvious grammar        |
| Notes restraint         | Empty when translation says it all         | Filler notes for every single bookmark              |
| Completion              | All bookmarks addressed                    | Silently skipped some                               |
