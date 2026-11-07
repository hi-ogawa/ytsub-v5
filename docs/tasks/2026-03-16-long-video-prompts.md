# Long Video AI Prompt Handling

## Problem

The pick-fill prompt sends all captions to a chat LLM in a single turn. Two issues emerge with longer videos:

1. **Attention quality degrades** — the LLM scans hundreds of captions in one pass, diluting focus. Picks become less interesting and more padded.
2. **Target pick count is nonsensical** — current formula (`duration_seconds / 10`) produces ~183 picks for a 30-min video. No learner wants 183 flashcards from one video. The number is arbitrary linear scaling with no pedagogical basis.

### What's NOT a problem (initial assumptions corrected)

- **Token limits**: 70KB ≈ 25K tokens. Gemini (1M), Claude (200K), ChatGPT (128K) all handle this easily.
- **Clipboard freeze**: already solved by file download button.
- **App-side chunking**: unnecessary complexity. The LLM can self-pace via prompt instructions.

### Real prompt samples

| Video ID    | Captions | Prompt size | Current target picks |
| ----------- | -------- | ----------- | -------------------- |
| DtK-CkwNHSY | 41       | 8 KB        | ~5-15                |
| p7WIBWWVGFg | 108      | 12 KB       | ~11                  |
| HuBek2qFGto | 203      | 20 KB       | ~20                  |
| aD8OiMk9SCg | 346      | 32 KB       | ~35                  |
| WoUnMQZ1L3c | 357      | 37 KB       | ~36                  |
| XsQwg-T0E4k | 544      | 47 KB       | ~113                 |
| -pLYheT4FL4 | 745      | 70 KB       | ~183                 |

## Approach: prompt-only multi-turn batching

No app-side chunking, no progressive UI, no ZIP files. Just two prompt changes:

### 1. Multi-turn splitting instruction

Tell the LLM to process ~150 captions at a time and ask the user to say "continue". All chat LLMs (Gemini, ChatGPT, Claude) support multi-turn natively. Each turn outputs a JSON code block that the user copies and imports — the app's existing additive import handles accumulation.

- **≤150 captions**: single turn, no change from current behavior
- **>150 captions**: LLM self-paces, user says "continue" between batches

| Captions | Turns |
| -------- | ----- |
| 41       | 1     |
| 108      | 1     |
| 203      | 2     |
| 346      | 3     |
| 544      | 4     |
| 745      | 5     |

### 2. Per-batch pick target instead of global count

Replace the global `duration / 10` formula with a loose per-batch range: "pick 5-10 interesting words per ~150 captions." The LLM picks based on quality, not quota. Total accumulates naturally across turns:

- Short video (41 caps): ~5-10 picks total
- Long video (745 caps): ~25-50 picks across 5 turns

This replaces `{{TARGET}}` in the prompt template and removes the `duration`-based calculation from `makeAiPrompt()`.

### Why this works

- **All chat LLMs support artifacts/canvas** — each turn's JSON code block is independently copyable
- **Import is already additive** — `createBookmarks()` appends via `[...this.bookmarks, ...newBookmarks]`
- **No app code changes needed** beyond removing the target calculation — it's a prompt-only change
- **LLM self-manages pacing** — no app-side chunking logic, no chunk navigator UI, no offset math

## Implementation

### Files to modify

- `src/lib/ai-prompt.md` — rewrite pick-fill instructions (splitting + per-batch target)
- `src/lib/ai-prompt.ts` — remove `{{TARGET}}` replacement, remove `duration` param from `makeAiPrompt()` (or keep for other uses)

### Prompt changes (draft)

In the pick-fill section, replace:

> pick {{TARGET}} interesting vocabulary words

With:

> Pick 5-10 of the most interesting vocabulary words from each batch of captions.

Add splitting instruction:

> If there are more than 150 captions, process ~150 at a time. After each batch, output your picks as a JSON code block, state where you stopped, and ask the user to say "continue".

## Future: app-side input splitting

The multi-turn prompt approach lets the LLM self-pace over one big input. The natural next step is splitting the **input** itself — generate separate prompt files per chunk (e.g. `prompt-1of5.txt`, `prompt-2of5.txt`).

Benefits over LLM-self-paced multi-turn:

- **Better attention** — each turn's context is only ~150 captions, not 745 with "start from where you left off"
- **Parallelizable** — user can open multiple chat sessions and process chunks simultaneously
- **Deterministic** — app controls chunk boundaries, no reliance on LLM remembering where it stopped

Engineering required:

- Chunk generation in `makeAiPrompt()` (split captions array, preserve global indices)
- Download as ZIP containing `prompt-1of5.txt`, `prompt-2of5.txt`, etc.
- ChatGPT unpacks ZIP natively; Claude can via code execution tool; others require manual unzip
- Same additive import handles results — no merge logic needed

Could be a quick win at a high caption threshold (e.g. >300 caps) since very long videos are uncommon. The ZIP download is straightforward; the main UX question is just guiding the user through "upload each file, copy each result, import."

Not needed now — the prompt-only approach is simpler and may be sufficient. Revisit if LLM self-pacing proves unreliable or users want parallel processing.

## Future: artifact/canvas output for context efficiency

Instruct the LLM to output JSON as an artifact (Claude), canvas (ChatGPT/Gemini) rather than inline in chat. All three platforms support this as of March 2026.

Why it matters for multi-turn: inline JSON responses accumulate in conversation context — each "continue" turn carries all previous JSON outputs as history, growing the context. Artifacts/canvas live in a side panel and are not re-processed as conversation context on subsequent turns, keeping each turn lean.

Prompt change would be minimal — add "Output your picks as a code artifact" or similar. Worth testing whether this actually reduces context accumulation in practice (platform-dependent behavior).

## Status

- **Phase**: Planning — prompt wording draft ready
- **What's done**: Problem reframing, approach settled (prompt-only multi-turn batching)
- **Next**: Finalize prompt wording, implement, test with real samples

## Feedback Log

- Initial doc over-engineered the problem (ZIP files, progressive UI, app-side chunking). Corrected after reviewing actual LLM context limits and chat app capabilities.
- Per-batch pick guidance preferred over global target count.
