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

## User flow

1. User installs Chrome extension, watches YouTube — caption panel appears on video page
2. User bookmarks words/phrases from captions — stored in IndexedDB
3. Clicking the extension icon opens **bookmarks page** (full browser tab) listing all bookmarked videos — clicking a card navigates to that YouTube video
4. (Optional) User signs in — data syncs to server
5. (Optional) User visits **web app** on another device — sees synced videos, can view captions/bookmarks but cannot fetch new videos from YouTube

## Subtitle fetching

Content scripts on `youtube.com` have same-origin access, so they can call YouTube's internal APIs (`youtubei/v1/player`, `timedtext`) without CORS restrictions. No external server can do this, which is why the extension is the only way to get subtitle data.

YouTube's subtitle system has two layers of protection:

1. **CORS**: the `timedtext` API is on `youtube.com`, so cross-origin requests are blocked. Being on the YouTube page (same-origin) solves this.
2. **POT (Proof of Origin Token)**: YouTube's WEB client requires a `pot` parameter on `timedtext` requests, generated at runtime by botguard JS. The `baseUrl`s from `ytInitialPlayerResponse` lack this token, so fetching them directly returns empty responses.

The workaround comes from yt-dlp: call `youtubei/v1/player` with mobile client headers from the YouTube page. Mobile clients (`IOS`, `ANDROID`, `ANDROID_VR`) don't require SUBS POT, because mobile apps have their own attestation (App Store, device integrity), so YouTube doesn't layer browser-based botguard on top. Same-origin solves CORS, and the mobile client identity solves POT.

This approach is fragile, because YouTube can break it by requiring SUBS POT for mobile clients. See [YouTube subtitle fetching](concepts/youtube-subtitle-fetching.md) for how we follow yt-dlp and what to check when it breaks.

## Extension structure

The extension is a thin shell. Core logic (subtitle extraction, json3 parsing, caption alignment, UI components) lives in shared modules under `src/lib/` and `src/components/`, reusable by the extension, dev-viewer, and web app. Extension-specific code (`src/extension/content.tsx`) is a thin wrapper: Shadow DOM injection, `pointer-events` layering, and YouTube data fetching, delegating all UI to shared components.

Loading or reloading a Chrome extension on every change is slow. The dev-viewer (`/dev/videos/:videoId`) renders the same caption panel using local fixture data (`/scripts/youtube-json/`), so UI iteration happens via `pnpm dev` without touching the extension.

## UI surfaces

The extension and the web app render the same shared pages:

- **Caption panel** shows dual captions and the bookmarking overlay. The extension's content script renders it on YouTube video pages, and the web app renders it at `/videos/:id` from synced data.
- **Bookmarks page** lists bookmarked videos. The extension opens it as `bookmarks.html` in a full browser tab, and the web app serves it at `/`.

The web app requires login for these pages. The `/dev` routes render them without auth so the extension UI can be developed and e2e-tested without YouTube or the extension runtime. `/dev` mirrors the extension bookmarks page, `/dev/videos/:id` mirrors the content script with fixture data, and `/dev/fixtures` links to the available fixtures.

## AI workflow

The AI integration evolved through two approaches:

1. **Agent skill** (retired): local AI agent runs yt-dlp + LLM end-to-end. Slow (~3-7 min), fragile.
2. **Prompt clipboard flow** (current): generate self-contained prompt with all context, user pastes into any LLM chat, copies result JSON back. Model-agnostic, no infrastructure. Three task types:
   - **Pick & Fill** — AI selects interesting vocab from captions, provides translations/etymology
   - **Fill Bookmarks** — AI fills metadata for existing bookmarks
   - **Fix ASR** — AI corrects auto-generated subtitle errors

## Data model

**Client** — `IndexedDB` stores caption sessions (video metadata + merged captions + bookmarks), keyed by youtubeId. This is the primary data store for both extension and web app UI.

**Server** — D1 (SQLite) stores videos, captions, bookmarks. Schema in `src/server/schema.ts`. Used for sync/backup, not direct UI rendering.

**Export format** — `import.json` is the interchange format. Contains video metadata, merged captions, and bookmarks. Used by extension export, server import API, and sync.
