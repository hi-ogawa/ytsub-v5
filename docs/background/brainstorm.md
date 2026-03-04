# Brainstorm: ytsub redesign goals

## Context

- Korean study paused (Anki stopped ~2 months), YouTube consumption continues as passive input
- Already have a working CLI pipeline: YouTube → yt-dlp subs → LLM vocab extraction → review → Anki (korean-vocab skill)
- v3 was a full web app (Remix, MySQL, auth, SRS, bookmarks) — died when PlanetScale killed hobby tier
- v4 pivoted to Chrome extension (WXT, React) — prototype stage, captions + typing practice, no SRS yet
- Market is crowded: Language Reactor, Trancy, Migaku, etc. all do dual subs + click-translate + some SRS

## What worked well (from prior versions)

- Subtitle viewing with dual languages (v1-v4)
- Bookmarking specific phrases/words from captions (v3)
- SRS practice with configurable decks (v3)
- Typing practice (v3, v4)
- The korean-vocab skill pipeline (LLM extraction → review → Anki) is lightweight and effective

## What didn't work / friction points

- v3 required hosting a database — died when free tier went away
- Full web app is heavy to maintain as a side project
- Separate app from YouTube = context switching
- v4 extension approach is better for integration but building SRS inside an extension is complex

## High-level goals to discuss

### 1. What's the core value proposition vs existing tools?

Existing tools focus on: dual subs, click-to-translate, vocab saving.

Possible differentiators:

- **LLM-powered vocab extraction** — not just click-to-translate, but intelligent extraction of notable/useful words from a whole video
- **Anki integration** — most tools have their own SRS; leveraging existing Anki setup (with its ecosystem) is a strength
- **Personal workflow** — doesn't need to be a product for others, can be optimized for your specific Korean learning workflow
- **No hosting costs** — local-first or extension-only, no database to maintain

### 2. Platform: what form should it take?

Options:

- **a) Chrome extension** (v4 direction) — closest to where you watch, but complex to build and maintain
- **b) CLI/agent pipeline** (korean-vocab skill direction) — already works, LLM-native, low maintenance
- **c) Local web app** — runs locally, no hosting costs, full UI flexibility
- **d) Hybrid** — lightweight extension for capture + local app/CLI for processing and Anki sync

### 3. Core features (what's essential?)

- [ ] Subtitle fetching from YouTube (yt-dlp handles this)
- [ ] Dual subtitle display (Korean + English/Japanese)
- [ ] Vocab extraction (LLM-powered, beyond simple dictionary lookup)
- [ ] Review/curation step (approve/reject words)
- [ ] Anki card creation (with audio, context, examples)
- [ ] Anki sync

### 4. Nice-to-haves

- [ ] Typing practice
- [ ] SRS built-in (or just rely on Anki?)
- [ ] Bookmark specific moments in videos
- [ ] Progress tracking / analytics
- [ ] Multi-language support (not just Korean)

### 5. What should it NOT be?

- Not a Language Reactor clone (they do dual subs + click-translate well enough)
- Not a hosted service (avoid the PlanetScale problem)
- Not over-engineered (sustainable side project, not a startup)

## Key insight from brainstorming (2026-03-03)

The korean-vocab skill's LLM extraction step is the core value — it picks up new phrases/vocab from content you're already enjoying passively. That makes learning feel tangible.

**The gap**: the skill outputs plain text/table with timestamps, but there's no connection back to the video. What's wanted is a YouTube viewer where extracted vocab is displayed alongside the video, auto-scrolling to the picked-up items as you watch.

### Refined vision

```
YouTube video player
  + subtitle display (Korean, optionally dual)
  + sidebar/overlay: LLM-extracted vocab list, anchored to timestamps
    - auto-scrolls as video plays
    - click a vocab item → jumps to that moment
    - each item shows: Korean, meaning, context from subtitle
  + from here: approve/reject → Anki pipeline
```

This is NOT about real-time click-to-translate (Language Reactor does that fine).
This IS about: watch a video, get an intelligent summary of "here's what's worth learning", integrated with playback.

### Flow

1. Paste YouTube URL
2. Fetch subtitles (yt-dlp)
3. LLM extracts notable vocab with timestamps
4. View video with vocab panel — auto-scroll, click-to-seek
5. Curate (approve/reject words)
6. Send approved → Anki (audio, context, examples)

### Platform direction

A **local web app** seems right:

- Full UI control (video player + vocab panel)
- No hosting costs (runs locally)
- YouTube iframe embed or yt-dlp for playback
- Can call LLM APIs directly
- Anki sync via AnkiConnect (localhost)
- No extension store review / Chrome API constraints
- Could be a simple Vite + React app with a thin local backend

### Decisions (2026-03-03)

- **Platform**: local web app, desktop first, no mobile yet
- **LLM**: local agent + skill (current workflow). Runs locally, has direct access to yt-dlp, agent, etc.
- **Video UI**: YouTube embed + dual subtitle side panel (Korean/English columns), similar to v3/v4
- **Anki**: not a priority — once vocab is curated, pushing to Anki is trivial (already solved)
- **v4 reuse**: don't worry about reusing extension code, focus on the right design

### Infrastructure insight

The agent is **clawdbot** (openclaw/clawdbot) — a private Telegram bot running on local server. The korean-vocab skill runs through that bot. Tailscale already exposes SSH on that machine.

**`tailscale serve`** can expose a local web app to all devices — solves "viewable from any device" without cloud hosting.

```
Local server (already running clawdbot)
  ├── ytsub web app (tailscale serve)
  │   ├── YouTube embed + dual sub panel
  │   ├── vocab viewer (browse curated results)
  │   └── curation UI (approve/reject)
  ├── backend
  │   ├── yt-dlp (subtitle fetch)
  │   ├── LLM agent (vocab extraction)
  │   └── storage (SQLite or JSON, local)
  └── AnkiConnect (when needed)
```

### Architecture (settled)

The app is a standalone web service. The agent is NOT part of the app.

```
Any client (agent, CLI, curl, etc.)
  oRPC POST /api/videos/createVideo + createCaptions  →  app stores video + subs
  oRPC POST /api/bookmarks/createBookmarks            →  extracted vocab

You (browser)
  /  →  YouTube viewer + vocab panel + curation UI (oRPC client)
```

- Simple password auth (single user)
- App only receives structured data and presents it
- Doesn't know about yt-dlp, LLM, Anki — those are client concerns
- Deployable (Cloudflare, cheap VPS, etc.) or run locally
- API is the boundary

### Still open

- **Storage**: SQLite, Turso/D1, Postgres? Single-user so lightweight is fine.
- **Tech stack**: framework, hosting target
- **Data model**: what does a "video + vocab" record look like?
