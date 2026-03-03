# Agent Guide

## Quick Reference

| Command                 | When             |
| ----------------------- | ---------------- |
| `pnpm dev`              | Start dev server |
| `pnpm tsc && pnpm lint` | After changes    |
| `pnpm build`            | Before commit    |
| `pnpm test-e2e`         | Run e2e tests    |

## Key Docs

| File                              | Purpose                              |
| --------------------------------- | ------------------------------------ |
| `docs/prd.md`                     | Task list (features & priorities)    |
| `docs/background/architecture.md` | Architecture, data model, tech stack |
| `docs/tasks/YYYY-MM-DD-*.md`      | Task-specific planning/notes         |

Read `docs/prd.md` for the task list and `docs/background/architecture.md` for architecture context before implementing features.

## Task Documents

For non-trivial work, create `docs/tasks/YYYY-MM-DD-<topic>.md` **before implementing**.

Task docs should enable **handoff to a fresh agent** - include enough context to continue without conversation history.

**Structure:**

- Problem context and approach
- Reference files/patterns to follow
- Implementation steps
- Feedback log (append user feedback during iteration)
- **Status** (update before session ends):
  - What's done
  - What's remaining
  - Any blockers or open questions

**Workflow:**

1. Create task doc with plan
2. Wait for user feedback
3. Log feedback to task doc, iterate on plan
4. Proceed with implementation after approval
5. **Update status before ending session**

To continue in fresh session: `Read docs/tasks/YYYY-MM-DD-<topic>.md and continue`

## Conventions

- File names: kebab-case
- Minimize file splits (multiple components per file when related)

## Architecture

- **Frontend**: React 19 SPA (`src/`)
- **Backend**: Cloudflare Workers (`worker/`)
- **API**: oRPC (`/rpc/*` for frontend, `/api/*` OpenAPI for external clients)
- **Database**: Cloudflare D1 (SQLite)
- **Styling**: Tailwind CSS 4 + shadcn

## Agent Rules

- **Never run long-running tasks** (dev servers, watch modes, etc.)
- Use `pnpm build` to verify code, not `pnpm dev`
- User runs `pnpm dev` manually in their terminal

## Git Workflow

1. Create feature branch before starting work
2. Commit logical changes separately
3. **Run `pnpm lint` before every commit** (formats .ts, .tsx, .md, .json, etc.)
4. Confirm with user before committing
5. **Avoid force push** - accumulate commits instead (non-destructive)
