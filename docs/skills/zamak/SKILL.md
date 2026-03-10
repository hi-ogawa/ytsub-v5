---
name: zamak
description: >-
  AI browser extension tasks for zamak (Korean language learning from YouTube).
  Pick vocabulary, fill bookmark metadata, fix ASR — all via window.__zamak.
---

# zamak skill

Tasks for AI browser extensions on a zamak page with `window.__zamak` available.

## Rules

- Use ONLY `window.__zamak.*` methods. No screenshots, no clicking, no typing, no DOM interaction — ever.
- If any API call fails or returns unexpected results compared to this prompt explains: **STOP and report** what happened. Do not retry, work around, or fall back to other tools.
- To read data, use `window.__zamak.log.*` methods and read the console output. The browser extension's JS tool has an output sanitizer that blocks return values matching cookie/query-string patterns (bookmark IDs are UUIDs which trigger the sanitizer). The `log.*` methods bypass this by writing to the console buffer instead of returning values — they are **required**, not optional.
- All console output is prefixed with `ZAMAK:` (e.g. `ZAMAK:captions`, `ZAMAK:bookmarks`). Filter console messages by `ZAMAK:` to find relevant output.
- **Clear console after each read** to avoid duplicate output accumulating across calls.

## API

```js
// Read (log data to console — use these to read data)
window.__zamak.log.skillPrompt()   // logs ZAMAK:skillPrompt → skill instructions (call once per session only; large payload, static content)
window.__zamak.log.videoContext()  // logs ZAMAK:videoContext → { youtubeId, title, language1, language2 }
window.__zamak.log.captions()      // logs ZAMAK:captions → [{ idx, begin, end, text1, text2 }, ...]
window.__zamak.log.bookmarks()     // logs ZAMAK:bookmarks → [{ id, text, context, captionContext, translation, etymology, notes }, ...]

// Write (always read console afterwards to verify success/warnings/errors)
window.__zamak.addBookmarks([{ captionIndex, text }, ...])  // logs ZAMAK:addBookmarks done + warnings on skipped entries
window.__zamak.fillBookmarks([{ id, translation?, etymology?, notes? }, ...])  // logs ZAMAK:fillBookmarks done
window.__zamak.updateCaptions([{ idx, text1?, text2? }, ...])  // logs ZAMAK:updateCaptions done
```

---

## Task: Pick & Fill (main workflow)

Scan captions, suggest vocabulary, then fill metadata after user selects bookmarks. This is the common end-to-end workflow.

### Step 1: Read captions

```js
window.__zamak.log.captions();
window.__zamak.log.videoContext();
```

### Step 2: Pick notable vocab

Scan `text1` (Korean). Pick words that are:

- Intermediate+ level (skip 하다/가다/오다, particles, basic greetings)
- Slang, colloquial, internet-speak
- Hanja-based words where etymology aids memorization
- Context-dependent meanings

Target: ~1 per 10s of video duration.

### Step 3: Create bookmarks with metadata

Submit all bookmarks in a single `addBookmarks` call where possible.

```js
window.__zamak.addBookmarks([
  {
    captionIndex: 4,
    text: "헷갈리다",
    translation: "to be confused",
    etymology: "",
    notes: "Conjugated as 헷갈리기는 해 (softened).",
  },
  // ...
]);
```

Read console after calling. `ZAMAK:addBookmarks done` confirms how many were added vs skipped. If any were skipped, `ZAMAK:addBookmarks warnings` lists the reasons — fix `text` or `captionIndex` and resubmit only the skipped entries.

**`text` matching:** `text` must be an exact, contiguous, case-sensitive substring of the caption's `text1` field. Do not include speaker labels (e.g. `[나경]`) in `text`. Repeated lyric lines with identical `text1` at different `captionIndex` values are supported — each creates a separate bookmark.

**Fields:**

- `translation` — contextual English meaning for **this caption**, not a dictionary dump. Concise.
- `etymology` — Hanja breakdown if it aids memorization (e.g. `非現實的; 비(non) + 현실(reality) + 적(adj)`). Empty for native Korean words.
- `notes` — usage tips: formality, collocations, gotchas. 1-2 sentences max. Empty if nothing notable.

Use caption context to disambiguate. Be concise — flashcard-style. Contextual meaning over generic dictionary.

---

## Task: Fill Bookmarks

Fill metadata for bookmarks the user has already created. Same as Step 4-5 above, run standalone.

```js
window.__zamak.log.bookmarks();
```

Read the console output to get bookmark `id`s, then fill:

```js
window.__zamak.fillBookmarks([
  {
    id: "abc-123",
    translation: "to be confused",
    etymology: "",
    notes: "Conjugated as 헷갈리기는 해 (softened).",
  },
  // ...
]);
```

Same field guidelines as Pick & Fill Step 3. The difference: `fillBookmarks` targets existing bookmarks by `id`, while `addBookmarks` creates new ones by `captionIndex`.

---

## Task: Fix Korean ASR

Fix auto-generated Korean subtitle text using the English manual translation as reference.

```js
window.__zamak.log.captions();
```

Read the console output. Scan `text1` (Korean ASR) against `text2` (English manual). Fix misheard syllables, wrong spacing, `>>` markers, truncated words, repeated fragments.

**English is your anchor.** Fix only what's wrong — don't rephrase correct Korean. Preserve filler words and informal speech. When unsure, leave it and flag to user.

```js
window.__zamak.updateCaptions([
  { idx: 3, text1: "두바이 쿠키 먹어봤어?" },
  // ... only rows that need fixing
]);
```
