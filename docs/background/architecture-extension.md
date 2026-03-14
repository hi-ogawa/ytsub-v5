# Browser Extension — Architecture

The Chrome extension is the primary client. It runs on YouTube pages, fetches subtitles, renders a caption panel overlay, and handles the full bookmarking + AI workflow. All data is stored locally in IndexedDB and optionally synced to the server.

## Why an extension

Content scripts on `youtube.com` have same-origin access — they can call YouTube's internal APIs (`youtubei/v1/player`, `timedtext`) without CORS restrictions. No external server can do this. The extension is the only way to get subtitle data.

## How subtitle fetching works

YouTube's subtitle system has two layers of protection:

1. **CORS** — the `timedtext` API is on `youtube.com`, so cross-origin requests are blocked. Being on the YouTube page (same-origin) solves this.

2. **POT (Proof of Origin Token)** — YouTube's WEB client requires a `pot` parameter on `timedtext` requests, generated at runtime by botguard JS. The `baseUrl`s from `ytInitialPlayerResponse` lack this token, so fetching them directly returns empty responses.

The workaround (from yt-dlp): call `youtubei/v1/player` with **iOS client headers** from the YouTube page. Mobile clients (`IOS`, `ANDROID`, `ANDROID_VR`) don't require SUBS POT — mobile apps have their own attestation (App Store, device integrity), so YouTube doesn't layer browser-based botguard on top. The caption `baseUrl`s from the iOS client response work without POT.

**Same-origin solves CORS, iOS client identity solves POT.** Two orthogonal problems.

This approach is fragile — YouTube can break it by requiring SUBS POT for mobile clients.

## Extension structure

The extension is a thin shell. Core logic (subtitle extraction, json3 parsing, caption alignment, UI components) lives in shared modules under `src/lib/` and `src/components/`, reusable by the extension, dev-viewer, and web app. Extension-specific code (`src/extension/content.tsx`) is a thin wrapper: Shadow DOM injection, `pointer-events` layering, and YouTube data fetching — delegating all UI to shared components.

## Dev-viewer

Loading/reloading a Chrome extension on every change is slow. The dev-viewer (`/dev/youtube/:videoId`) renders the same caption panel using local fixture data (`/scripts/youtube-json/`), so UI iteration happens via `pnpm dev` without touching the extension. The dev-viewer uses the exact same shared components as the extension.
