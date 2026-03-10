# Task Doc Hygiene

## Problem

32 task docs in `docs/tasks/` with no lifecycle management. Completed docs contain stale line numbers, outdated implementation steps, and status checklists that contradict reality. New agents may follow old plans instead of reading current code, or waste time on already-completed work.

The docs are valuable for **planning** and **recording discoveries** but harmful when they pretend to describe current state.

## Changes

### 1. Archive completed task docs

Move completed docs to `docs/tasks/archive/`. Reduces noise for agents scanning the directory. Still findable when needed.

```
docs/tasks/archive/2026-03-03-bootstrap.md
docs/tasks/archive/2026-03-04-authentication.md
...
```

Criteria for archiving: the feature branch is merged and no active iteration is happening.

### 2. Trim archived docs to decisions + discoveries

Before archiving, strip implementation steps and status checklists — they rot immediately. Keep only:

- **Problem** — why the work was done
- **Decisions** — alternatives considered, what was chosen and why
- **Findings** — hard-won discoveries (e.g., POT requirements, API quirks)
- **Superseded by** — if work moved elsewhere

Example: the authentication doc's options comparison matrix and the browser extension doc's POT discovery are worth keeping. The step-by-step implementation plans are not.

### 3. Update AGENTS.md task doc guidance

Current guidance says to include implementation steps and status checklists. Revise to:

- **Planning phase** (before/during implementation): full format is fine — problem, approach, steps, reference files
- **After merge**: strip to decisions + discoveries, move to archive
- **Don't reference line numbers** — use function/component names instead
- **Don't maintain status checklists** — prd.md and git branch state are the source of truth
- **Small tasks** (< 1 session): skip the task doc entirely, just commit

### 4. Link task docs from prd.md

Add links from prd.md TODO/Done items to their task docs where relevant. Gives agents a path from "what to build" to "what was already explored."

### 5. Add `.claude/settings.json` allowed commands

Pre-allow safe commands so agents don't get permission-prompted on every build/lint:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm build)",
      "Bash(pnpm tsc)",
      "Bash(pnpm lint)",
      "Bash(pnpm test-e2e:*)",
      "Bash(pnpm test:*)"
    ]
  }
}
```

### 6. Add "don't touch" section to AGENTS.md

Flag fragile/dangerous areas:

- Never modify existing migration files — create new ones
- Extension YouTube extraction logic (`src/lib/youtube.ts`) is fragile — changes need `pnpm test-youtube` validation
- Don't modify auth token format without updating all clients

## Implementation

1. Create `docs/tasks/archive/` directory
2. Identify completed task docs (branch merged, no active work)
3. Trim each to decisions + discoveries, move to archive
4. Update AGENTS.md task doc section
5. Add prd.md links where task docs exist
6. Add `.claude/settings.json` permissions
7. Add "don't touch" section to AGENTS.md

## Open Questions

- Should archived docs be further consolidated into a single `docs/decisions-log.md`? Keeps everything in one searchable file vs. preserving per-topic granularity.
- Is `docs/tasks/archive/` the right location, or should completed docs just be deleted (git history preserves them)?
