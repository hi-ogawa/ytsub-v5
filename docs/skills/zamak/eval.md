# zamak skill — Eval

Manual evaluation workflow for the `window.__zamak` API + Claude for Chrome.

## Model Notes

These tasks are structured language work (translation, correction, lookup) — not complex reasoning. Haiku or Sonnet is sufficient and faster for the interactive loop. Opus is overkill.

Claude for Chrome uses whatever model Anthropic assigns (no user choice). Model selection becomes relevant if invoking via API directly (userscript, MCP, etc.).

## Prerequisites

- `pnpm dev` running
- Claude for Chrome extension installed
- Dev-viewer open at `http://localhost:5173/dev/youtube/<videoId>`

## Test Videos

Fixture data in `scripts/youtube-json/`. Each covers a different scenario.

| Video ID      | Scenario               | Ko subs | En subs              | Dev-viewer URL                                |
| ------------- | ---------------------- | ------- | -------------------- | --------------------------------------------- |
| `7GU_VQfgMT0` | A: Both manual         | manual  | manual               | `/dev/youtube/7GU_VQfgMT0` (Billlie, song)    |
| `DtK-CkwNHSY` | B: Ko auto + En manual | auto    | manual (en-US)       | `/dev/youtube/DtK-CkwNHSY` (tripleS, variety) |
| `aK8Yh3RTBUY` | C: Ko auto only        | auto    | auto-translated (en) | `/dev/youtube/aK8Yh3RTBUY`                    |

## Smoke Test (before running evals)

Verify Claude for Chrome can call the API at all. Step through one at a time. Add **"Do not try to fix anything"** to prevent rabbit holes.

1. `Run window.__zamak.getVideoContext() and show me the raw result. Do not try to fix anything.`
2. `Run window.__zamak.getCaptions() and show me the first 3 entries. Do not try to fix anything.`
3. `Run window.__zamak.getSkillPrompt() and summarize what it says. Do not try to fix anything.`

If any step errors, stop and debug before proceeding to evals.

## Eval 1: Pick & Fill (main workflow)

The common end-to-end flow: scan captions → suggest vocab → user selects → AI fills.

### Steps

1. Open dev-viewer for any video, open panel, select tracks
2. In Claude for Chrome, paste:

```
Read window.__zamak.getSkillPrompt() and run the "Pick & Fill" task.
```

3. Review suggestions — are they interesting, intermediate+ words?
4. Select the ones you want as bookmarks in the caption panel
5. Tell Claude to fill the bookmarks
6. Review filled bookmarks, export

### What to check

**Picking:**

| Check             | How                                                       |
| ----------------- | --------------------------------------------------------- |
| Level appropriate | Not basic (하다, 가다) or too obscure                     |
| Count reasonable  | ~1 per 10s of video duration                              |
| Variety           | Mix of Hanja words, slang, expressions — not all one type |
| Context provided  | Each suggestion references the caption where it appears   |

**Filling:**

| Check                | How                                                       |
| -------------------- | --------------------------------------------------------- |
| All filled           | `window.__zamak.getBookmarks()` — no empty translations   |
| Translation accurate | Matches the specific context, not generic dictionary      |
| Etymology useful     | Hanja breakdown where applicable, empty for native words  |
| Notes selective      | Not filler on every bookmark — empty when nothing notable |
| Export correct       | Settings → Export import.json → bookmarks have metadata   |

### Verify via console

```js
const bms = window.__zamak.getBookmarks();
console.table(
  bms.map((b) => ({
    text: b.text,
    translation: b.translation,
    etymology: b.etymology || "—",
    notes: b.notes || "—",
  })),
);
```

## Eval 2: Fill Bookmarks (standalone)

When bookmarks already exist and just need metadata filled.

### Steps

1. Open dev-viewer for `7GU_VQfgMT0`, open panel, select `.ko` + `.en`
2. Create 5-10 bookmarks by selecting Korean words in the caption panel
3. In Claude for Chrome, paste:

```
Read window.__zamak.getSkillPrompt() and run the "Fill Bookmarks" task.
```

4. Review — same checklist as Eval 1 filling section

## Eval 3: Fix Korean ASR (optional)

Best tested with scenario B or C (auto-generated Korean).

### Steps

1. Open dev-viewer for `DtK-CkwNHSY`, open panel, select `a.ko` + `.en-US`
2. In Claude for Chrome, paste:

```
Read window.__zamak.getSkillPrompt() and run the "Fix Korean ASR" task.
```

3. Review Claude's report and the corrected captions in the panel

### What to check

| Check               | How                                                          |
| ------------------- | ------------------------------------------------------------ |
| Corrections applied | Scan captions panel — Korean text should read more naturally |
| No over-correction  | Correct Korean wasn't rephrased                              |
| Uncertain flagged   | Claude reported which ones it wasn't sure about              |
| Count reasonable    | Not 0 fixes (something is always wrong), not 100% of rows    |

### Verify via console

```js
// Before: save original
const before = window.__zamak.getCaptions().map((c) => c.text1);

// After Claude runs, compare
const after = window.__zamak.getCaptions().map((c) => c.text1);
const changed = before
  .map((t, i) =>
    t !== after[i] ? { idx: i, before: t, after: after[i] } : null,
  )
  .filter(Boolean);
console.table(changed);
```

## Examples

### Bookmark fill

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

**Output:** `{ translation: "to be confused", etymology: "", notes: "Conjugated as 헷갈리기는 해 (softened). Common in spoken Korean." }`

### Bookmark fill (Hanja word)

**Input:** `{ text: "비현실적", context: "너무 비현실적이야 이게" }`

**Output:** `{ translation: "surreal, unrealistic", etymology: "非現實的; 비(non) + 현실(reality) + 적(adj)", notes: "" }`

### ASR fix

**Before:** `{ idx: 3, text1: "두정 먹어봤어?", text2: "Have you tried Dubai cookies?" }`

**After:** `window.__zamak.updateCaptions([{ idx: 3, text1: "두바이 쿠키 먹어봤어?" }])`

## Quality Checklists

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

### ASR Correction

| Dimension    | Good                           | Bad                                 |
| ------------ | ------------------------------ | ----------------------------------- |
| Accuracy     | Matches what was actually said | Invented plausible but wrong Korean |
| Restraint    | Only changed broken text       | Rewrote correct casual speech       |
| Completeness | Found all garbled words        | Missed obvious errors               |
| Uncertainty  | Flagged unclear cases          | Guessed silently                    |

## Eval Log

Record results here. Append new entries at the top.

```
(no runs yet)
```
