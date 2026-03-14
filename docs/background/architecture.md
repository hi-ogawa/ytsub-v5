# ytsub (Zamak) — Architecture

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- LLM-powered vocab extraction (e.g. local agent with custom skill) works well but outputs plain text — no connection back to the video
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction

## Core concept

A local-first language learning tool built around YouTube subtitles. The core workflow:

1. **Watch** a video with dual caption panel (target language + translation)
2. **Bookmark** words/phrases — manually select, or let AI pick interesting vocab
3. **AI-fill** metadata — export prompt with captions+bookmarks baked in, paste into any LLM (Claude, ChatGPT, Gemini), copy result JSON back. AI provides translations, etymology, usage notes.
4. **Review & study** — curated vocabulary with full video context

The AI prompt clipboard flow is what makes the tool powerful: model/provider-agnostic, prompt is inspectable, works with any chat UI. See `src/lib/ai-prompt.ts` for prompt generation and `docs/tasks/2026-03-11-ai-prompt-clipboard-flow.md` for the design.

## Three layers

```
Extension (primary client)
  └── Self-sufficient: fetches subtitles, caption panel, bookmarks, AI workflow
  └── Stores locally in IndexedDB
  └── Optionally syncs to server

Server (persistence for cross-device access)
  └── Stores videos, captions, bookmarks in D1 (SQLite)
  └── Login required — no anonymous access

Web app (view into server-synced data)
  └── Always requires login — its purpose is cross-device access
  └── Pulls server data into IndexedDB, then renders same UI as extension
  └── For when you can't install the extension (mobile, shared computers)
```

### Extension — the primary client

The extension is self-sufficient. It fetches YouTube subtitles (same-origin), renders the caption panel, handles bookmarking, AI prompt workflow, and stores everything locally in IndexedDB. It works standalone without a server account.

The extension is the **only** way data enters the system — the web app cannot call YouTube APIs.

### Server — persistence layer

The server stores synced data for cross-device access and backup. It's not the primary data source for any UI. Login is always required.

### Web app — cross-device viewer

The web app exists for accessing your data from devices where the extension isn't available (mobile, other browsers). It always requires login because without server sync there's no data to show — the web app can't fetch from YouTube.

The web app pulls server data into IndexedDB, then renders the same `CaptionPanel` UI as the extension (`sessionOnly` mode — no track picker, no caption fetching).

### Shared components

Extension and web app render the same UI components:

| Component               | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `CaptionPanel`          | Full panel: track picker (extension only), settings, tabs |
| `CaptionList`           | Caption rows with bookmark highlights, auto-scroll        |
| `BookmarksPage`         | Video list with sync badges                               |
| `CaptionSessionManager` | In-memory store backed by IndexedDB                       |

## Browser extension as data source

See [architecture-extension.md](./architecture-extension.md) for how the extension fetches subtitles from YouTube (same-origin + iOS client spoofing to bypass CORS and POT).

## Dev-viewer for testing

The dev-viewer (`/dev/:videoId`) provides the same caption panel experience using local fixture data, so UI iteration happens via `pnpm dev` without loading the extension. It uses the exact same shared components as both the extension and the web app.

## AI workflow evolution

1. **Agent skill** (legacy): local AI agent runs yt-dlp, parses subtitles, extracts vocabulary end-to-end. Slow (~3-7 min), fragile. See `docs/skills/`.
2. **`window.__zamak` API** (`docs/tasks/2026-03-09-ai-extension-integration.md`): expose bookmarks to AI browser extensions (Claude for Chrome) via `window.__zamak.fillBookmarks()`. Works but heavy — Chrome debugger banner, no model choice.
3. **AI prompt clipboard flow** (current, `docs/tasks/2026-03-11-ai-prompt-clipboard-flow.md`): generate self-contained prompt file with captions+bookmarks+instructions, user pastes into any LLM chat, copies result JSON back. Model-agnostic, inspectable, no infrastructure. Three task types:
   - **Pick & Fill**: AI selects interesting vocab from captions and provides translations/etymology
   - **Fill Bookmarks**: AI fills metadata for existing manually-created bookmarks
   - **Fix ASR**: AI corrects auto-generated subtitle text

## Data model

### Client storage (IndexedDB)

- `PersistedCaptionSession`: video metadata + merged captions + bookmarks, keyed by `youtubeId`
- `videoIndexStore` (localStorage): lightweight index of all videos with bookmark counts, for the video list page

### Server storage (D1 SQLite)

See `src/server/schema.ts`. Used for sync/backup:

- **videos**: metadata (youtubeId, title, channel, language pair, vssIds)
- **captions**: one row per merged cue with `text1`/`text2`
- **bookmarks**: enriched with `translation`, `context`, `notes`, `status`. `caption_id` nullable.

### Export format (`export.json`)

The interchange format between extension export and web app import. Contains `video` (metadata), `captions` (merged cues), and `bookmarks` (with captionIdx references). Same format used by server `importVideo` API and client `importExportData()`.
