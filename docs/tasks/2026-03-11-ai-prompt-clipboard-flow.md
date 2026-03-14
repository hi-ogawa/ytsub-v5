# AI Prompt Clipboard Flow

## Problem

The current AI assist uses Claude for Chrome to interact with the page via `window.__zamak`. This works but the overhead isn't justified — the bottleneck is the LLM task itself (single-shot language work), not the browser automation. Claude for Chrome also has drawbacks: Chrome debugger banner on all tabs, output sanitizer workarounds, no model choice.

A simpler flow achieves the same result: copy prompt with data baked in, paste into any LLM chat, copy result back, import into app.

## Direction

Replace the "copy prompt for Claude for Chrome" flow with a self-contained prompt file workflow:

1. **Export**: App generates a prompt file with all context (captions, bookmarks, instructions, output format)
2. **Chat**: User drags/pastes file into any LLM chat (Claude.ai, ChatGPT, Gemini, etc.)
3. **Import**: User copies the JSON code block from LLM response, pastes back into app

Key properties:

- **Model/provider agnostic** — works with any chat UI that accepts file uploads or paste
- **Prompt is inspectable** — user can read/edit before sending
- **Output is a JSON code block** — every chat UI renders these with a copy button
- **`window.__zamak` stays** — power users can still use Claude for Chrome; not removing it

## Open Questions & Things to Test

### Prompt format & size

- [ ] What format works best across chat UIs? `.md` vs `.txt` vs `.json`
- [ ] Max practical prompt size before chat UIs choke or UX degrades
  - 10-min video (~60 captions, ~10KB) — should be fine everywhere
  - 1-hour video (~360 captions, ~50KB) — test paste vs file upload
  - 2-hour video (~720 captions, ~100KB) — likely needs chunking or time-range selection
- [ ] File upload vs paste: which chat UIs support drag-and-drop file upload?
  - Claude.ai: file attachments yes
  - ChatGPT: file attachments yes
  - Gemini: file attachments yes
  - Others?
- [ ] Does the prompt need to fit in a single message, or can we split instructions + data?

### Output format & import

- [ ] "Return a single JSON code block" — do all chat UIs render code blocks with copy button?
- [ ] Claude.ai artifacts: does asking for an artifact improve copy UX? Is it worth provider-specific prompting?
- [ ] JSON size for results — Pick & Fill on a 1-hour video could produce 30+ bookmarks. Is the JSON response ever truncated?
- [ ] How to handle partial/malformed JSON from LLM (validation on import)

### Prompt engineering

- [ ] Test each task (Pick & Fill, Fill Bookmarks, Fix ASR) across providers
- [ ] Quality comparison: does inline context produce same quality as the `window.__zamak` flow?
- [ ] Optimal caption format in prompt: table vs compact list vs JSON
- [ ] How much of SKILL.md instructions to inline vs simplify for one-shot use
- [ ] Model size: Haiku/GPT-4o-mini sufficient, or does quality require Sonnet/GPT-4o?

## Tasks per prompt type

### Pick & Fill

**Input data needed**: video title, captions (idx, begin, text1, text2)

**Output JSON**:

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

**Import action**: `onCreateBookmarks` with metadata fields

### Fill Bookmarks

**Input data needed**: bookmarks (id, text, context, captionContext), video title

**Output JSON**:

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

**Import action**: new `onFillBookmarks` handler (update existing bookmarks by id)

### Fix Korean ASR

**Input data needed**: captions (idx, text1, text2)

**Output JSON**:

```json
[{ "idx": 3, "text1": "두바이 쿠키 먹어봤어?" }]
```

**Import action**: new `onUpdateCaptions` handler

## App-side implementation

### Changes to existing UI

- `AiPromptCopy` component: change from "copy short prompt" to "download prompt file"
  - Needs `session` data (rows, bookmarks, video context) passed as props
  - Generates self-contained prompt with data + instructions + output format spec
  - Downloads as file (or copies to clipboard for small prompts — TBD based on testing)

### New UI needed

- **Import AI result**: button/action to paste JSON back into the app
  - Could live in the settings dropdown alongside the export button
  - Textarea or modal for pasting
  - Parse JSON, validate shape, apply to session (create bookmarks / fill metadata / update captions)
  - Show errors for malformed input

### Prompt template

Rough structure of the generated prompt file:

`````markdown
# zamak: [Task Name]

[Task-specific instructions — what to do, quality guidelines]

## Video

Title: [title]
Language: Korean + English

## Captions

| idx | time | Korean                | English                  |
| --- | ---- | --------------------- | ------------------------ |
| 0   | 0:05 | 이게 현실인지 꿈인지  | Is this real or a dream? |
| 1   | 0:08 | 아직 좀 헷갈리기는 해 | I'm still a bit confused |

...

## Existing Bookmarks (for Fill task only)

[bookmark data]

## Output

Return a single JSON code block with this exact shape:

````json
[{ ... }]
\```

Do not include any other output outside the code block.
````
`````

```

## Status

- **Phase**: Planning
- **What's done**: Problem identified, direction agreed, task doc created
- **Next**: Test prompt formats manually across chat UIs, then implement app-side changes

## Feedback Log

(append user feedback here)
```
