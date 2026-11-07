# Agent Guide

## Quick Reference

| Command                 | When                                                      |
| ----------------------- | --------------------------------------------------------- |
| `pnpm tsc && pnpm lint` | After changes (`pnpm lint` formats .ts, .tsx, .md, .json) |
| `pnpm build`            | Verify the build                                          |
| `pnpm test-e2e`         | Run web app e2e tests                                     |
| `pnpm build-ext`        | Build Chrome extension                                    |
| `pnpm test-e2e-ext`     | Run extension e2e tests                                   |
| `pnpm test-e2e-full`    | Run both web app + ext e2e                                |

## Key Docs

Read the [architecture overview](docs/architecture.md) before implementing features. [docs/README.md](docs/README.md) indexes the rest of the docs.

## UI surfaces

Pages/views across extension and web app:

- **Extension** (bookmarks page tested via `test-e2e-ext`; content script not directly testable — `/dev` routes mirror it)
  - Content script (YouTube video page) → `CaptionPanel` — dual captions + bookmarking overlay
  - Extension page `/bookmarks.html` → `BookmarksPage` — video list, opens in a full browser tab
- **Web app**
  - `/` → `BookmarksPage` (auth gated)
  - `/videos/:id` → `VideoViewerPage` with shared `CaptionPanel` (auth gated, reads from local storage synced from server)
  - `/dev` → `BookmarksPage` without auth — mirrors extension bookmarks page for testing
  - `/dev/fixtures` → fixture list with links to `/dev/videos/...` (dev ergonomics)
  - `/dev/videos/:id` → `CaptionPanel` with fixture data — mirrors extension content script for testing

The `/dev` routes exist so extension UI can be developed and e2e-tested without loading YouTube or the Chrome extension runtime. They use the same shared components (`BookmarksPage`, `CaptionPanel`, `VideoCard`) with fixture data instead of IndexedDB/server data.

## Conventions

- Commit messages: use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)
- Never rebase, amend, or force push. Merge `origin/main` into the branch when needed
- File names: kebab-case
- Minimize file splits (multiple components per file when related)
- Run `.ts` scripts with `node` (not `tsx`/`ts-node`) — Node natively supports TypeScript stripping
- Prefer `undefined` over `null`
- Prefer optional properties (`{ x?: T }`) over explicit undefined (`{ x: T | undefined }`)
- Make props/params required when all call sites always pass them — don't default to optional
- Never run long-running tasks (dev servers, watch modes, etc.). Use `pnpm build` to verify code, not `pnpm dev`
- Never use `--` to pass args to pnpm scripts. pnpm doesn't need `--` and it silently breaks filtering. Write `pnpm test "filename" -t "pattern"` or `pnpm test-e2e "filename" -g "pattern"` directly.

## E2E Tests

### Auth boundary: `/dev` routes vs auth-gated routes

Tests split along the auth boundary — this is the key architectural principle:

- **`/dev` route tests** (dev-viewer.spec.ts): use fixture data, **no `login()`, no `setupDb()`**. Just `page.goto("/dev/videos/...")`. These are fast and parallelizable.
- **Auth-gated tests** (sync, video-list, basic): need `setupDb({ seed: true })` + `login(page)` because they hit `/`, `/videos/:id`, or server APIs.

When adding new tests, prefer `/dev` routes unless the feature requires server interaction. Never add `login()` to a test that only uses `/dev` routes.

### Test organization

| File                  | What it tests                       | Needs auth/DB? |
| --------------------- | ----------------------------------- | -------------- |
| dev-viewer.spec.ts    | Caption panel, bookmarks, AI prompt | No             |
| sync.spec.ts          | Push/pull sync flows                | Yes            |
| video-list.spec.ts    | Video list, import, delete          | Yes            |
| basic.spec.ts         | Auth UI, navigation, toast, theme   | Mixed          |
| api.spec.ts           | Server API CRUD                     | Yes (API only) |
| auth.spec.ts          | Auth API endpoints                  | Yes (API only) |
| ext/bookmarks.spec.ts | Extension bookmarks, sync badges    | Yes            |

### Bug fix tests

Every bug fix must include a test that **fails on `main` and passes with the fix**. If existing tests don't cover the broken path, add one that does. A fix without a reproducing test isn't verified.

### Writing tests

- **Flat structure**: no `test.describe` nesting — inline `setupDb()` and `login()` per test
- **Prefer rich flow tests** over thin 1-assertion tests. Each test pays ~500ms navigation overhead, so combining related assertions into one test saves real time.
- **`setupDb()`** writes to sqlite directly (~0.15s). Always use `setupDb({ seed: true })` before `login()` — login requires the seed user to exist.
- **Selector preference**: scope to `data-testid` or panel containers to avoid ambiguity (e.g. FAB text can collide with tab button names). Prefer `getByTestId` > `getByRole` scoped to a container > page-wide `getByText`.
- **Iterate with bail**: use `pnpm test-e2e -x` to stop on first failure when fixing tests. Avoids waiting for the full suite on each iteration.
- **JSON report** at `test-results/report.json` — use it to measure timing impact of changes.

### Extension e2e tests (`e2e/ext/`)

Extension tests load the built extension in a real Chromium instance. **Must run `pnpm build-ext` before `pnpm test-e2e-ext`** — tests use `dist/extension/`.

- Separate Playwright project (`ext`) with its own fixtures in `e2e/ext/helper.ts`
- `test` fixture launches Chromium with `--load-extension`, provides `context`, `extensionId`, `page`
- `gotoBookmarks(page, extensionId)` — navigates to `chrome-extension://<id>/bookmarks.html` with server URL override
- `seedChromeStorage(context, data)` — seeds `chrome.storage.local` via the service worker
- `login(page)` — logs in via the extension bookmarks page UI (distinct from the web app `login` helper)
- Push/pull sync requires a YouTube tab (tab RPC). Tests without a YouTube tab verify error toasts.
