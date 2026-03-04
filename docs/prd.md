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

## TODO

### ~~API — Import & bookmarks~~ ✓

- [x] feat: `videos/createVideo` — upsert video with metadata (on youtube_id conflict)
- [x] feat: `videos/createCaptions` — bulk insert caption cues for a video
- [x] feat: `videos/listVideos` — paginated, newest first
- [x] feat: `videos/getVideo` — with caption counts per language
- [x] feat: `videos/deleteVideo` — cascade deletes captions
- [x] feat: `bookmarks/createBookmarks` — bulk create (default status = `pending`)
- [x] feat: `bookmarks/listBookmarks` — filterable by videoId, status
- [x] feat: `bookmarks/updateBookmark` — partial update (status, translation, notes)
- [x] feat: `bookmarks/deleteBookmark`

### Video list page

- [ ] feat: video list page — fetch and display videos as cards
  - show title, channel, duration, language pair, created date
  - link to viewer page
- [ ] feat: client-side routing (TanStack Router or similar)
  - `/` → video list
  - `/videos/:id` → viewer

### Video viewer — layout & embed

- [ ] feat: viewer page layout — YouTube embed (left) + caption panel (right)
- [ ] feat: YouTube embed component — iframe player API integration
  - play/pause, seek, current time events
- [ ] feat: caption panel — dual column layout (language1 | language2)
  - fetch captions for video, align by timestamp
- [ ] feat: caption auto-scroll — sync scroll position with video playback time
- [ ] feat: caption click-to-seek — click a caption row to seek video to that timestamp
- [ ] feat: current caption highlight — visually indicate the active caption row
- [ ] feat: virtualized caption list — TanStack Virtual for large subtitle files (1000+ cues)
- [ ] feat: repeat/loop mode — loop a section between two caption timestamps

### Bookmark features

- [ ] feat: bookmark indicators in caption panel — show which captions have bookmarks (icon/dot)
- [ ] feat: bookmark navigation — prev/next bookmark buttons to skip through bookmarked captions
- [ ] feat: bookmark approval flow — inline approve/reject buttons for `pending` bookmarks in viewer
- [ ] feat: bookmark list page — browse/search all bookmarks across videos
  - filter by status, video, search text
- [ ] feat: manual bookmarking — text selection in caption panel to create bookmark
  - DOM walk via `data-index`, `data-side`, `data-offset` attributes (v3 approach)
  - `partitionRanges` to split caption text into highlighted/non-highlighted spans
- [ ] feat: bookmark highlight rendering — show bookmarked words/phrases inline in caption text
  - reusable for both manual and agent-created bookmarks

### Skill authoring

- [ ] feat: agent skills
  - yt-dlp fetch + LLM caption correction + translation + vocab extraction + POST to app
  - correct bad Korean auto-captions from context
  - generate English translation from Korean-only subs
  - cross-reference with manual subs in other languages when available
  - see `background/skill-integration.md` for details

### Misc

- [ ] Authentication (single-user)
- [ ] chore: unit-testable API layer — swap `cloudflare:workers` env + D1 drizzle adapter for local SQLite (e.g. `better-sqlite3`) so RPC handlers can be tested directly without spinning up wrangler/Playwright
- [ ] chore: separate dev and E2E databases — use different D1 state paths (e.g. `--persist-to`) so `pnpm dev` and `pnpm test-e2e` don't share data
- [ ] chore: E2E `db:reset` before test run — run db reset in Playwright `globalSetup` so each test suite starts with a clean DB
- [ ] chore: dev DB seed script — populate dev DB with sample videos, captions, and bookmarks for manual testing

## TODO: Backlog

- [ ] Bookmark export — JSON export for Anki pipeline consumption
- [ ] Full-text search — search across captions and bookmarks (D1 FTS or LIKE)
- [ ] Keyboard shortcuts — space (play/pause), arrow keys (prev/next caption), etc.
- [ ] Bookmark curation shortcuts — approve/reject without mouse
- [ ] Mobile-friendly layout
- [ ] Browser extension as data source (content script fetches subs from YouTube same-origin)
- [ ] Authentication (multi users)
- [ ] Typing practice (v3/v4 had this)
