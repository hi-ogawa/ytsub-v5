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

## UI surfaces

Pages/views across extension and web app:

- **Extension** (cannot be tested directly in e2e — web app `/dev` routes mirror these)
  - Content script (YouTube video page) → `CaptionPanel` — dual captions + bookmarking overlay
  - Extension page `/bookmarks.html` → `BookmarksPage` — video list, opens in a full browser tab
- **Web app**
  - `/` → `BookmarksPage` (auth gated)
  - `/videos/:id` → `VideoViewerPage` with shared `CaptionPanel` (auth gated, reads from local storage synced from server)
  - `/dev` → `BookmarksPage` without auth — mirrors extension bookmarks page for testing
  - `/dev/fixtures` → fixture list with links to `/dev/videos/...` (dev ergonomics)
  - `/dev/videos/:id` → `CaptionPanel` with fixture data — mirrors extension content script for testing

The `/dev` routes exist so extension UI can be developed and e2e-tested without loading YouTube or the Chrome extension runtime. They use the same shared components (`BookmarksPage`, `CaptionPanel`, `VideoCard`) with fixture data instead of IndexedDB/server data.

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

## Conventions

- File names: kebab-case
- Minimize file splits (multiple components per file when related)
- Run `.ts` scripts with `node` (not `tsx`/`ts-node`) — Node natively supports TypeScript stripping
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them — don't default to optional

## Agent Rules

- **Never run long-running tasks** (dev servers, watch modes, etc.)
- Use `pnpm build` to verify code, not `pnpm dev`
- User runs `pnpm dev` manually in their terminal
- **Never use `--` to pass args to pnpm scripts.** pnpm doesn't need `--` and it silently breaks filtering. Write `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"` directly.

## E2E Tests

- **dev-viewer tests** use fixture data — no DB setup needed, just `login(page)` + `goto("/dev/videos/...")`
- **video-viewer tests** need `setupDb({ seed: true })` for server data
- **Text selection** (for bookmark creation) requires DOM Range API via `page.evaluate` — mouse drag doesn't work reliably
- **Selector preference**: scope to `data-testid` or panel containers to avoid ambiguity (e.g. FAB text can collide with tab button names). Prefer `getByTestId` > `getByRole` scoped to a container > page-wide `getByText`.
- **Iterate with bail**: use `pnpm test-e2e -x` to stop on first failure when fixing tests. Avoids waiting for the full suite on each iteration.

## Git Workflow

1. Create feature branch before starting work
2. Commit logical changes separately
3. **Run `pnpm lint` before every commit** (formats .ts, .tsx, .md, .json, etc.)
4. Confirm with user before committing
5. **Avoid force push** - accumulate commits instead (non-destructive)
