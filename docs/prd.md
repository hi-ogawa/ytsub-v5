# ytsub — Task List

A web app for language learning via YouTube subtitles. Watch videos with dual caption panel, bookmark vocab, curate vocabulary. See [./background/architecture.md](./background/architecture.md) for the motivations and details.

## Done

- [x] chore: project scaffold (Vite + React 19 + TypeScript + Tailwind 4)
- [x] chore: Cloudflare Workers + D1 setup (wrangler, vite plugin)
- [x] chore: oRPC server with health endpoint
- [x] chore: oRPC client with TanStack Query integration
- [x] chore: database schema and migration (videos, captions, bookmarks)
- [x] chore: Playwright E2E setup with basic health check
- [x] chore: lint/format tooling (oxfmt, knip)
- [x] feat: `videos/createVideo` — upsert video with metadata (on youtube_id conflict)
- [x] feat: `videos/createCaptions` — bulk insert caption cues for a video
- [x] feat: `videos/listVideos` — paginated, newest first
- [x] feat: `videos/getVideo` — with caption counts per language
- [x] feat: `videos/deleteVideo` — cascade deletes captions
- [x] feat: `bookmarks/createBookmarks` — bulk create (default status = `pending`)
- [x] feat: `bookmarks/listBookmarks` — filterable by videoId, status
- [x] feat: `bookmarks/updateBookmark` — partial update (status, translation, notes)
- [x] feat: `bookmarks/deleteBookmark`
- [x] feat: video list page — fetch and display videos as cards
  - show title, channel, duration, language pair, created date
  - link to viewer page
- [x] feat: client-side routing (TanStack Router or similar)
  - `/` → video list
  - `/videos/:id` → viewer
- [x] feat: viewer page layout — YouTube embed (left) + caption panel (right)
- [x] feat: YouTube embed component — iframe player API integration
  - play/pause, seek, current time events
- [x] feat: caption panel — dual column layout (language1 | language2)
  - fetch captions for video, align by timestamp
- [x] feat: caption auto-scroll — sync scroll position with video playback time
- [x] feat: caption click-to-seek — click a caption row to seek video to that timestamp
- [x] feat: current caption highlight — visually indicate the active caption row
- [x] feat: virtualized caption list — TanStack Virtual for large subtitle files (1000+ cues)
- [x] feat: "2nd tab" in caption panel to show bookmark as list
- [x] feat: bookmark indicators in caption panel — show which captions have bookmarks (icon/dot)
- [x] feat: bookmark navigation — prev/next bookmark buttons to skip through bookmarked captions
- [x] feat: agent skills
- [x] Authentication (single-user)
- [x] chore: separate dev and E2E databases — use different D1 state paths (e.g. `--persist-to`) so `pnpm dev` and `pnpm test-e2e` don't share data
- [x] chore: E2E `db:reset` before test run — run db reset in Playwright `globalSetup` so each test suite starts with a clean DB
- [x] chore: dev DB seed script — populate dev DB with sample videos, captions, and bookmarks for manual testing
- [x] fix: `importVideo` caption insert hits D1 SQL variable limit on large videos (~300+ captions) — need to batch the insert
- [x] feat: bookmark highlight rendering — show bookmarked words/phrases inline in caption text
- [x] feat: import file upload — upload `import.json` via UI instead of API curl
- [x] chore: normalize SKILL.md artifacts — align intermediate file schemas, remove API concerns
- [x] fix: tweak captions view auto scroll
  - smooth
  - no auto scroll during interaction
  - ability to disable
- [x] feat: manual bookmarking — text selection in caption panel to create bookmark
  - DOM walk via `data-index`, `data-side`, `data-offset` attributes (v3 approach)
- [x] fix: bookmark popover — dismiss previous popover immediately when a new one opens (currently they can overlap due to timeout)
- [x] fix: bookmark popover — allow upward or downward positioning to avoid clipping under the panel container

## TODO

- [ ] feat: repeat/loop mode — loop a section between two caption timestamps
- [ ] chore: unit-testable API layer — swap `cloudflare:workers` env + D1 drizzle adapter for local SQLite (e.g. `better-sqlite3`) so RPC handlers can be tested directly without spinning up wrangler/Playwright
- [ ] refactor: use `sql` template for `createdAt` schema defaults instead of string literal — avoids Drizzle binding `(datetime('now'))` as a param, reducing bind count per row and allowing larger batch sizes
- [ ] feat: repeatable eval process for ytsub agent skill — run skill against sample videos, check for common failure modes (wrong offsets, API errors, subtitle quality issues, payload format), track success rate across runs
- [ ] feat: Bookmark export — export to import bookmarks for Anki study
- [ ] test: test skills/scripts

## TODO: Extension

See ytsub-v4 for relevant technique.

- [x] captions panel shouldn't cover YouTube's top-right profile popover
- [ ] captions panel should be hidable (FAB at bottom-right, default closed)
- [ ] captions panel width should be changeable.
- [ ] align captions viewer experience with app video viewer (e.g. auto-scroll sensitivity)
- [ ] align/merge captions algorithm improvements

## TODO: Backlog

- [ ] feat: bookmark approval flow — inline approve/reject buttons for `pending` bookmarks in viewer
- [ ] feat: bookmark list page — browse/search all bookmarks across videos
- [ ] Full-text search — search across captions and bookmarks (D1 FTS or LIKE)
- [ ] Keyboard shortcuts — space (play/pause), arrow keys (prev/next caption), etc.
- [x] Mobile-friendly layout
- [x] Browser extension as data source (content script fetches subs from YouTube same-origin)
- [ ] Authentication (multi users)
- [ ] Typing practice (v3/v4 had this)
