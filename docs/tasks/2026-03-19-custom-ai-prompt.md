# Custom AI Prompt

## Problem

The AI prompt template (`src/lib/ai-prompt.md`) is hardcoded with Korean-specific content:

- **pick-fill**: references "Korean vocabulary", "TOPIK2", "Hanja", Korean example words (체중, 어이없다), Korean learner levels
- **fill**: references "learn Korean", "Hanja", Korean-specific etymology field
- **fix-asr**: references "Korean ASR subtitles", "Korean column"
- `AI_TASKS` labels mention "Korean" ("Fix Korean ASR")

Users studying other languages get a prompt that doesn't match their target language. There's no way to customize the prompt without editing source code.

## Goals

1. Make the default prompt language-independent (works for any language pair)
2. Let users customize the base prompt (override/edit the template)

## Approach

### Part 1: Language-independent default prompt

Rewrite `ai-prompt.md` to be generic. Key changes:

- Replace "Korean" with "target language" / infer from caption tracks
- Replace "TOPIK2" with generic difficulty guidance ("intermediate to advanced level")
- Replace "Hanja" / etymology with generic "etymology/roots if applicable"
- Use generic examples or no examples in the template
- Rename "Fix Korean ASR" → "Fix ASR"
- Inject the actual language names into the prompt dynamically via new template variables `{{LANG1}}` and `{{LANG2}}` (resolved from the selected caption tracks, e.g. "Korean", "English")

The prompt can say things like: "You are helping me learn **{{LANG1}}** from a YouTube video" — concrete at runtime, generic in the template.

### Part 2: Customizable prompt

**Option A — Editable textarea in settings (recommended)**

- Add a "Custom prompt" section to the caption panel settings dropdown (or a dedicated modal opened from the AI prompt area)
- Show the resolved default prompt in a textarea, user can edit freely
- Persist to localStorage (`zamak:ai-prompt-custom:{task}`) — one key per task
- `makeAiPrompt()` checks for custom prompt first, falls back to default
- "Reset to default" button per task
- Prompt variables (`{{TITLE}}`, `{{CAPTIONS}}`, `{{BOOKMARKS}}`, `{{LANG1}}`, `{{LANG2}}`) still get substituted in custom prompts

Pros: Full flexibility, simple implementation, familiar UX pattern (many AI tools do this)
Cons: Full template can be intimidating; user might break variable placeholders

**Option B — Structured overrides (simpler but less flexible)**

- Settings form with fields: target language name, learner level, etymology label, extra instructions
- These values get injected into the default template
- No free-form editing of the full prompt

Pros: Can't break the prompt, easier to understand
Cons: Limited flexibility, more UI work for each new knob, doesn't cover all customization needs

**Option C — Hybrid (template + instruction append)**

- Keep the default template as-is (not editable)
- Add an "Additional instructions" textarea that gets appended to the prompt
- Add a "Language" setting (dropdown or text input) that overrides `{{LANG1}}`/`{{LANG2}}`

Pros: Simple, low risk of breaking the prompt, covers the main use cases
Cons: Can't change the core instructions if they don't fit

### Recommendation

**Option A** is the most flexible and the simplest to implement (one textarea, localStorage read/write). The risk of users breaking placeholders is mitigable: show a warning if `{{CAPTIONS}}` is missing, and always provide "Reset to default".

Alternatively, **Option C** is a good middle ground if we want to keep things simpler — a language override + additional instructions covers 90% of customization needs with less UI surface.

## Reference files

| File                                       | Role                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `src/lib/ai-prompt.md`                     | Prompt templates (3 tasks, separated by `# ---`)                      |
| `src/lib/ai-prompt.ts`                     | Template parsing, variable substitution, result import                |
| `src/components/caption-panel.tsx:184-277` | `AiPromptCopy` UI component                                           |
| `src/components/caption-panel.tsx:319-322` | `langName()` — resolves vssId to display name via `Intl.DisplayNames` |
| `src/lib/caption-session.ts`               | `CaptionSessionManager` — has track info (`vssId1`, `vssId2`)         |

## Implementation steps (pending approach decision)

### If Option A:

1. Add `{{LANG1}}` / `{{LANG2}}` template variables to `makeAiPrompt()`
2. Rewrite `ai-prompt.md` to be language-independent using those variables
3. Update `AI_TASKS` labels (remove "Korean")
4. Add localStorage persistence for custom prompts per task
5. Add "Edit prompt" UI (modal with textarea, reset button, placeholder validation warning)
6. Update e2e tests

### If Option C:

1. Steps 1-3 same as above
2. Add localStorage keys for language override + additional instructions
3. Add settings UI (language input + instructions textarea)
4. `makeAiPrompt()` appends additional instructions after template
5. Update e2e tests

## Status

- **Planning** — awaiting feedback on approach (A vs C vs other)
