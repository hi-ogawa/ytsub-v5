# ytsub — Task List

## Features & implementation order

### P0 — Core viewer (MVP)

1. **Import video + captions** — API endpoint to receive video metadata + subtitle cues
2. **Video list** — browse imported videos
3. **Video viewer** — port v3's viewer layout:
   - YouTube embed (left) + scrolling dual caption panel (right, 2-col: language1 | language2)
   - Auto-scroll with playback, click caption to seek
   - Virtualized subtitle list (TanStack Virtual or similar)
   - Current entry highlighted, repeat mode for looping sections
4. **Bulk bookmark API** — endpoint for agent to push extracted vocab in batch
5. **Bookmark navigation in viewer** — when bookmarks exist for a video, provide a way to skip through only the bookmarked captions (prev/next bookmark, or a filtered view showing only bookmarked entries)

### P1 — Curation & browse

6. **Bookmark status** — approve/reject flow for agent-pushed entries (inline in viewer)
7. **Bookmark list** — browse/search all bookmarks across videos
8. **Manual bookmarking** — v3's approach worth keeping: native text selection + data-attribute DOM walk (`data-index`, `data-side`, `data-offset`) to map selection back to caption/position. `partitionRanges` splits caption text into highlighted/non-highlighted spans. Minimal code, natural UX. Lower priority but the highlight rendering is reusable for showing agent-created bookmarks in captions too.

### P2 — Quality of life

9. **Bookmark export** — JSON export for Anki pipeline consumption
10. **Search** — full-text search across captions and bookmarks
11. **Keyboard shortcuts** — efficient curation without mouse

### P1.5 — Skill authoring

- [ ] Author agent skill for clawdbot (the main way data enters the app)
- [ ] Skill handles: yt-dlp fetch, LLM caption correction, translation, vocab extraction, POST to app
- [ ] See `notes/skill-integration.md` for details

Key LLM capabilities:

- Correct bad Korean auto-captions from context
- Generate English translation from Korean-only subs (single track is enough)
- Cross-reference with manual subs in other languages when available

### Future / maybe

- Typing practice (v3/v4 had this)
- Extension as data source (content script fetches subs from YouTube same-origin, POSTs to app API — replaces yt-dlp step)
- Mobile-friendly layout
