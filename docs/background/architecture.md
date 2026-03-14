# Zamak — Architecture

## Problem

- YouTube is a rich source of language input (Korean), but passive watching doesn't convert to active learning
- Prior ytsub versions died due to YouTube API restrictions (v3) or extension complexity (v4)
- Existing tools (Language Reactor, etc.) focus on click-to-translate; none do intelligent batch vocab extraction with LLMs

## Core workflow

1. **Watch** a video with dual caption panel (target language + translation)
2. **Bookmark** words/phrases — manually select, or let AI pick interesting vocab from captions
3. **AI-fill** metadata — copy prompt (with captions + bookmarks baked in) into any LLM chat, copy result JSON back. AI provides translations, etymology, usage notes.
4. **Review & study** — curated vocabulary with full video context

The AI prompt clipboard flow is model/provider-agnostic (Claude, ChatGPT, Gemini, etc.), the prompt is inspectable, and it works with any chat UI. This is the core value — not just subtitle viewing, but LLM-assisted vocabulary curation tied to video context.

## Three layers

**Extension** — the primary client. Self-sufficient: fetches YouTube subtitles (same-origin), renders caption panel, handles bookmarking and AI workflow, stores everything locally in IndexedDB. Works standalone without a server account.

**Server** — persistence for cross-device access. Stores synced videos, captions, and bookmarks. Login required. Not the primary data source for any UI — clients always read from local storage.

**Web app** — a view into server-synced data. Always requires login — its purpose is accessing your data from devices where the extension isn't available (mobile, other browsers). Pulls server data into local storage, then renders the same caption panel UI as the extension.

The extension is the **only** way data enters the system. The web app cannot fetch from YouTube — it only displays data that was synced from the extension via the server.

## Subtitle fetching

See [architecture-extension.md](./architecture-extension.md) for how the extension fetches subtitles from YouTube (same-origin access + iOS client spoofing to bypass CORS and POT).

## AI workflow

The AI integration evolved through two approaches:

1. **Agent skill** (legacy): local AI agent runs yt-dlp + LLM end-to-end. Slow (~3-7 min), fragile.
2. **Prompt clipboard flow** (current): generate self-contained prompt with all context, user pastes into any LLM chat, copies result JSON back. Model-agnostic, no infrastructure. Three task types:
   - **Pick & Fill** — AI selects interesting vocab from captions, provides translations/etymology
   - **Fill Bookmarks** — AI fills metadata for existing bookmarks
   - **Fix ASR** — AI corrects auto-generated subtitle errors

## Data model

**Client** — `IndexedDB` stores caption sessions (video metadata + merged captions + bookmarks), keyed by youtubeId. This is the primary data store for both extension and web app UI.

**Server** — D1 (SQLite) stores videos, captions, bookmarks. Schema in `src/server/schema.ts`. Used for sync/backup, not direct UI rendering.

**Export format** — `import.json` is the interchange format. Contains video metadata, merged captions, and bookmarks. Used by extension export, server import API, and sync.
