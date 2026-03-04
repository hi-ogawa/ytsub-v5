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

### API — Import & bookmarks

- [ ] feat: POST `/api/videos` — create video with metadata (youtube_id, title, channel, duration, languages)
- [ ] feat: POST `/api/videos/:id/captions` — bulk insert caption cues for a video
  - accept array of `{ language, index, begin, end, text }`
  - validate video exists
- [ ] feat: GET `/api/videos` — list videos (paginated, newest first)
- [ ] feat: GET `/api/videos/:id` — get video with caption summary (cue counts per language)
- [ ] feat: POST `/api/bookmarks` — bulk create bookmarks for a video
  - accept array of `{ video_id, caption_id?, text, side, offset, translation, context, timestamp, notes }`
  - default status = `pending`
- [ ] feat: GET `/api/bookmarks` — list bookmarks (filterable by video_id, status)
- [ ] feat: PATCH `/api/bookmarks/:id` — update bookmark (status, translation, notes)

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

## TODO: Backlog

- [ ] Bookmark export — JSON export for Anki pipeline consumption
- [ ] Full-text search — search across captions and bookmarks (D1 FTS or LIKE)
- [ ] Keyboard shortcuts — space (play/pause), arrow keys (prev/next caption), etc.
- [ ] Bookmark curation shortcuts — approve/reject without mouse
- [ ] Mobile-friendly layout
- [ ] Browser extension as data source (content script fetches subs from YouTube same-origin)
- [ ] Authentication (password auth, single-user)
- [ ] Typing practice (v3/v4 had this)
