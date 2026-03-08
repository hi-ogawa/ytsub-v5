# Cloud-based AI Integration — Brainstorm

## Context

The current ytsub pipeline relies on **openclaw** — a persistent personal AI agent running on Telegram (Claude Code-based, with skills, memory, heartbeats, subagents). The ytsub skill is one of many skills in the `openclaw-home-private` workspace.

### Current flow
1. Hiroshi sends a YouTube URL to openclaw via **Telegram**
2. Openclaw invokes the `ytsub` skill (wrapper in `openclaw-home-private/skills/ytsub/`)
3. The skill delegates to the full skill in `ytsub-v5/docs/skills/ytsub/SKILL.md`
4. The agent runs yt-dlp, parses subtitles, uses its own LLM reasoning for caption alignment/translation/vocab extraction
5. Produces `import.json`, delivers it back via **Telegram** (as a file attachment)
6. Hiroshi imports via the app's upload UI

### What works well
- **Telegram as interface** — can trigger from phone, no CLI needed
- **Agent intelligence** — handles quality judgment calls (which subs to use, auto-gen quality assessment, step-by-step review)
- **No API cost** — the agent's own LLM usage is "free" (part of Claude Code subscription)
- **Integrated with other skills** — openclaw already has memory, context, knows Hiroshi's preferences

### Pain points / what motivates this brainstorm
- The agent skill is a **complex multi-step orchestration** — fragile, hard to test, hard to iterate on prompts
- Each import is a long interactive session (~5-10 min of agent work)
- The skill is tightly coupled to Claude Code's tool environment
- Subtitle processing logic lives in SKILL.md instructions (prompt-based) rather than deterministic code
- **No automated testing** — can't regression-test the pipeline
- If openclaw's environment changes (Claude Code updates, tool changes), the skill may break

**Question:** Could we move the intelligent parts of this pipeline into the ytsub app itself (calling Claude API server-side), simplifying or eliminating the agent skill?

---

## Current Pipeline

```
Hiroshi → Telegram message (YouTube URL)
  → openclaw agent (Claude Code)
    → yt-dlp fetches metadata + subtitles
    → Scripts parse json3 → cue arrays
    → Scripts attempt alignment
    → Agent's own LLM reasoning: fixes/translates/audits captions
    → Agent's own LLM reasoning: picks vocab bookmarks
    → Scripts validate bookmark offsets
    → Agent assembles import.json
  → Telegram file delivery (import.json)
  → Hiroshi uploads via web UI
```

---

## Option A: Fully Cloud-based Pipeline

Move the entire pipeline into the app. User pastes a YouTube URL in the web UI, the server does everything.

### How it would work
1. User pastes YouTube URL in the web app
2. Server fetches subtitles (via yt-dlp or a subtitle extraction service/library)
3. Server calls Claude API for caption alignment/translation + vocab extraction
4. Results stored directly in D1
5. User reviews/curates in the UI

### Pros
- **Paste-and-go** — works from any device, no Telegram round-trip
- **No skill maintenance** — no SKILL.md, no intermediate files, no multi-step agent orchestration
- **Deterministic + testable** — same prompts, version-controlled, can regression-test
- **Could run on a schedule** — e.g., auto-import new videos from subscribed channels

### Cons
- **yt-dlp on the server is the biggest blocker** — Cloudflare Workers can't run yt-dlp. Options:
  - Separate backend service (VPS/container) just for yt-dlp
  - Subtitle extraction API/service (cobalt, etc.) — fragile dependency
  - YouTube `timedtext` API — undocumented, used by browser extensions
- **API costs** — Claude API per video (~$0.05-0.25, see estimates below)
- **Latency** — LLM processing takes 30-60s+; need async job handling
- **Less human-in-the-loop** — agent currently makes quality judgment calls per step
- **Cloudflare Workers limits** — CPU time limits, may need Durable Objects or queues for long LLM calls

---

## Option B: Hybrid — Openclaw Fetches, App Processes

Keep openclaw/yt-dlp for subtitle fetching, but move all AI processing into the app.

### How it would work
1. Hiroshi sends YouTube URL to openclaw via Telegram (same as today)
2. Openclaw runs yt-dlp, uploads **raw json3 subtitle files** to the app's API (new endpoint)
3. App server calls Claude API for alignment/translation + vocab extraction
4. Results stored in D1, Hiroshi reviews/curates in the web UI
5. Openclaw's skill becomes ~10 lines (fetch + upload) instead of ~200

### Pros
- **Keeps Telegram as trigger** — no workflow change for Hiroshi
- **Simpler skill** — openclaw just fetches and uploads, no LLM orchestration
- **AI processing is centralized and testable** — version-controlled prompts, regression tests
- **Easier to iterate on prompts** — change server-side, no skill update needed
- **Evolves naturally** — if subtitle fetching moves server-side later, skill just disappears

### Cons
- **Still depends on openclaw** for triggering (but much less fragile)
- **API costs** — same as Option A
- **Latency / async handling** — same as Option A
- **Less interactive** — no per-step review during import (but could add review UI)

---

## Option C: Cloud AI as In-App Enhancement Only

Keep openclaw pipeline as-is for import. Add cloud AI features **within the app** for post-import tasks.

### How it would work
- Import flow stays as-is (openclaw → import.json → upload)
- **Add AI features in the web UI:**
  - "Re-extract bookmarks" button on a video → Claude API suggests more vocab
  - "Translate caption" for missing text2 → fills in translations
  - "Explain this word" on a bookmark → etymology/usage/example sentences
  - "Auto-bookmark" → run vocab extraction on already-imported videos

### Pros
- **No migration needed** — additive, doesn't replace anything
- **Targeted API usage** — only call LLM when user wants it, lower costs
- **Best of both worlds** — bulk pipeline stays on openclaw (free), cloud AI for enhancement
- **Incremental** — can add one feature at a time
- **Useful regardless of pipeline direction** — these features have standalone value

### Cons
- **Doesn't simplify the skill** — openclaw still does the heavy orchestration
- **Two AI systems** — agent skill + cloud API, two sets of prompts to maintain
- **Scope creep risk** — easy to keep adding "just one more AI feature"

---

## Option D: App Owns the Pipeline, Openclaw Just Triggers

The app becomes the brain. Openclaw (or any client) just provides the URL and raw subs.

### How it would work
1. **Trigger:** Hiroshi sends URL to openclaw → openclaw calls `POST /api/importFromUrl` with raw json3 files
   - Or: Hiroshi pastes URL directly in the web UI (if server-side subtitle fetching works)
   - Or: Browser extension sends subs from YouTube same-origin
2. **Server pipeline:**
   - Parse json3 → cue arrays (deterministic scripts, ported to server)
   - Assess subtitle quality (which scenario: both manual, auto+manual, etc.)
   - Call Claude API for alignment/translation/vocab extraction
   - Store results as "pending review" in D1
3. **UI:** Hiroshi reviews results in the app — approve/edit/reject captions and bookmarks
4. **Notify:** Server sends Telegram notification when processing is done (or openclaw polls)

### Pros
- **Openclaw skill becomes trivial** — fetch subs + POST to API, done
- **All intelligence is in version-controlled code** — testable, debuggable, iterable
- **Multiple trigger paths** — Telegram, web UI, browser extension, CLI — all feed the same pipeline
- **Review happens in the right place** — the app, not a Telegram conversation
- **Can regression-test** the entire pipeline with sample videos
- **Prompt iteration is a code change**, not a skill doc rewrite

### Cons
- **API costs** (~$0.05-0.25/video — see estimates below)
- **Async handling complexity** on CF Workers (Durable Objects or queues)
- **Migration effort** — need to build server-side pipeline + review UI
- **Loses the conversational quality check** — agent currently flags issues mid-process; need to replicate via structured validation

---

## Key Technical Considerations

### Claude API Cost Estimate

Based on ytsub-eval runs (actual agent stats):

| Video | Captions | Tokens | Tool calls | Time |
|-------|----------|--------|------------|------|
| 7GU_VQfgMT0 (song, both manual) | 52 pairs | 35k | 18 | ~3 min |
| E8KM2qWSUS0 (variety, ko auto + en) | 286 pairs | 109k | 24 | ~7 min |
| DtK-CkwNHSY (variety, ko auto + en-US) | 40 pairs | 38k | 18 | ~3 min |
| eNdOWsNPmf8 (song, both manual) | 70 pairs | 40k | 25 | ~3.5 min |

These are *total agent tokens* (includes tool call overhead, reasoning, retries). A structured API pipeline would use fewer tokens since:
- No tool call overhead (direct API calls, not agent loop)
- No exploratory reasoning — prompts are fixed
- Parsing/validation is code, not LLM

Estimated cloud API usage per video: **20-60k tokens** (rough halving of agent overhead).

At Sonnet 4 pricing ($3/M input, $15/M output, assuming 70/30 split):
- Short video (3 min song): ~20k tokens → **~$0.05-0.10**
- Long video (10 min variety): ~60k tokens → **~$0.15-0.40**
- At ~5 videos/week: **~$1-8/month**

Note: the current agent runs on Claude Code (subscription), so these costs would be *new* spend. But very manageable.

### Async Processing on Cloudflare
- Workers have 30s CPU limit (paid plan)
- LLM API calls are I/O (not CPU), so they might fit within limits
- For safety: use **Cloudflare Queues** or **Durable Objects** for job management
- Pattern: API accepts job → returns job ID → client polls or uses WebSocket for status

### What Stays Deterministic (No LLM Needed)
The eval confirms these tasks should be **code, not LLM calls**:
- json3 parsing → cue arrays (`parse-json3.ts` — already a script)
- Cue alignment check (`check-alignment.ts` — already a script)
- Bookmark offset validation (`validate-bookmarks.ts` — catches 2-8 errors per video)
- import.json assembly (just `jq`/code)

Only these tasks need the LLM:
- Caption alignment/translation when script merge fails (scenarios B/C/D)
- Fixing auto-generated Korean text
- Vocab bookmark selection + metadata (translation, etymology, notes)

This split is good news — the server pipeline is mostly deterministic code with targeted LLM calls.

### Subtitle Fetching Without yt-dlp
- This is the unsolved problem. Options to research:
  - `cobalt.tools` API — extracts from YouTube but may not support subtitle-only
  - YouTube `timedtext` API — undocumented, used by some browser extensions
  - Browser extension (already in backlog) — content script has same-origin access
  - For now, keep yt-dlp as the answer; revisit when browser extension is built

---

## Reframing

After discussion, the conclusion is that **cloud AI integration should be deprioritized**. Most of the pipeline can be replaced by deterministic code + better UI. See:

- `2026-03-08-ai-less-workflow.md` — the AI-less import workflow (preferred direction)
- `2026-03-08-unaligned-caption-viewer.md` — viewer design that removes the alignment requirement

Cloud AI remains a future **optional enhancement** (auto-fix garbled Korean, suggest bookmarks, fill etymology) once the core AI-less workflow is solid.

---

## Open Questions

1. **How important is per-step review?** Current agent allows approve/reject at each stage (subs fetched → captions aligned → bookmarks picked). Cloud pipeline would be batch — process everything, review at the end. Is that OK?
2. **Keep openclaw skill as fallback?** During migration, run both paths in parallel? Or cut over?
3. **Model choice for cloud processing?** Sonnet is cheapest and likely sufficient for caption alignment. Vocab extraction might benefit from Opus. Or use Haiku for simple tasks (parsing, validation)?
4. **CF Workers vs separate service?** Workers have CPU/subrequest limits. Long LLM calls are I/O (not CPU) so may be fine, but Durable Objects add complexity. Alternative: a simple Node.js service on Fly.io/Railway?
5. **Telegram notification?** When server-side processing finishes, notify via Telegram? (Could use a webhook to openclaw, or a direct Telegram bot API call from the app)

---

## Status

- **Phase:** Brainstorm / awaiting feedback
- **Next:** Get user feedback on direction before any implementation
