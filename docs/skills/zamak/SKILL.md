---
name: zamak
description: >-
  AI browser extension tasks for zamak (Korean language learning from YouTube).
  Pick vocabulary, fill bookmark metadata, fix ASR — all via window.__zamak.
---

# zamak skill

Tasks for AI browser extensions on a zamak page with `window.__zamak` available.

## API

```js
// Read
window.__zamak.getVideoContext()   // → { youtubeId, title, language1, language2 }
window.__zamak.getCaptions()       // → [{ idx, begin, end, text1, text2 }, ...]
window.__zamak.getBookmarks()      // → [{ id, text, context, captionContext, translation, etymology, notes }, ...]

// Write
window.__zamak.fillBookmarks([{ id, translation?, etymology?, notes? }, ...])
window.__zamak.updateCaptions([{ idx, text1?, text2? }, ...])
```

---

## Task: Pick & Fill (main workflow)

Scan captions, suggest vocabulary, then fill metadata after user selects bookmarks. This is the common end-to-end workflow.

### Step 1: Read captions

```js
const captions = window.__zamak.getCaptions();
const video = window.__zamak.getVideoContext();
```

### Step 2: Pick notable vocab

Scan `text1` (Korean). Pick words that are:

- Intermediate+ level (skip 하다/가다/오다, particles, basic greetings)
- Slang, colloquial, internet-speak
- Hanja-based words where etymology aids memorization
- Context-dependent meanings

Target: ~1 per 10s of video duration.

### Step 3: Present (don't write)

List picks for user review:

```
1. 헷갈리다 (caption 4: "아직 좀 헷갈리기는 해") — to be confused
2. ...
```

User selects bookmarks manually in the caption panel.

### Step 4: Fill metadata

Once user has created bookmarks:

```js
const bookmarks = window.__zamak.getBookmarks();
window.__zamak.fillBookmarks([
  { id: "...", translation: "...", etymology: "...", notes: "..." },
  // ...
]);
```

**Fields:**

- `translation` — contextual English meaning for **this caption**, not a dictionary dump. Concise.
- `etymology` — Hanja breakdown if it aids memorization (e.g. `非現實的; 비(non) + 현실(reality) + 적(adj)`). Empty for native Korean words.
- `notes` — usage tips: formality, collocations, gotchas. 1-2 sentences max. Empty if nothing notable.

Use caption context to disambiguate. Be concise — flashcard-style. Contextual meaning over generic dictionary.

### Step 5: Verify

```js
window.__zamak.getBookmarks();
```

Report: how many filled, any skipped/uncertain.

---

## Task: Fill Bookmarks

Fill metadata for bookmarks the user has already created. Same as Step 4-5 above, run standalone.

```js
const bookmarks = window.__zamak.getBookmarks();
// fill translation/etymology/notes per bookmark
window.__zamak.fillBookmarks([...]);
```

---

## Task: Fix Korean ASR

Fix auto-generated Korean subtitle text using the English manual translation as reference.

```js
const captions = window.__zamak.getCaptions();
```

Scan `text1` (Korean ASR) against `text2` (English manual). Fix misheard syllables, wrong spacing, `>>` markers, truncated words, repeated fragments.

**English is your anchor.** Fix only what's wrong — don't rephrase correct Korean. Preserve filler words and informal speech. When unsure, leave it and flag to user.

```js
window.__zamak.updateCaptions([
  { idx: 3, text1: "두바이 쿠키 먹어봤어?" },
  // ... only rows that need fixing
]);
```
