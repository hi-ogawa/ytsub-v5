# Agent Guide

## Quick Reference

| Command                 | When             |
| ----------------------- | ---------------- |
| `pnpm dev`              | Start dev server |
| `pnpm tsc && pnpm lint` | After changes    |
| `pnpm build`            | Before commit    |
| `pnpm test-e2e`         | Run e2e tests    |

## Key Docs

| File                               | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `docs/prd.md`                      | Task list (features & priorities) |
| `docs/background/architecture.md`  | Problem context, design decisions |
| `docs/chrome-store-submissions.md` | Chrome Web Store listing details  |
| `docs/tasks/YYYY-MM-DD-*.md`       | Task-specific planning/notes      |

Read `docs/prd.md` for the task list and `docs/background/architecture.md` for architecture context before implementing features.

## Two isolated UI paths

The codebase has two independent caption/bookmark UIs. Know which one you're working on:

- **Web app** (`routes/video-viewer.tsx`) — full-stack, server DB via oRPC/React Query. Self-contained in one route file.
- **Extension** (`components/caption-panel.tsx`, `components/caption-list.tsx`) — client-only, IndexedDB. The dev-viewer (`routes/dev-viewer.tsx`) renders these with fixture data so extension UI can be iterated without loading YouTube. See `docs/background/architecture-extension.md`.

They implement the same UI independently because the extension has no backend. Consolidation is planned (see `docs/prd.md`). Changes to one path don't automatically apply to the other.

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
- Run `.ts` scripts with `node` (not `tsx`/`ts-node`) — Node natively supports TypeScript stripping

## Agent Rules

- **Never run long-running tasks** (dev servers, watch modes, etc.)
- Use `pnpm build` to verify code, not `pnpm dev`
- User runs `pnpm dev` manually in their terminal
- **Never use `--` to pass args to pnpm scripts.** pnpm doesn't need `--` and it silently breaks filtering. Write `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"` directly.

## E2E Tests

- **dev-viewer tests** use fixture data — no DB setup needed, just `login(page)` + `goto("/dev/youtube/...")`
- **video-viewer tests** need `setupDb({ seed: true })` for server data
- **Text selection** (for bookmark creation) requires DOM Range API via `page.evaluate` — mouse drag doesn't work reliably
- **Selector preference**: scope to `data-testid` or panel containers to avoid ambiguity (e.g. FAB text can collide with tab button names). Prefer `getByTestId` > `getByRole` scoped to a container > page-wide `getByText`.

## Git Workflow

1. Create feature branch before starting work
2. Commit logical changes separately
3. **Run `pnpm lint` before every commit** (formats .ts, .tsx, .md, .json, etc.)
4. Confirm with user before committing
5. **Avoid force push** - accumulate commits instead (non-destructive)
