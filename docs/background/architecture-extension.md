# Browser Extension — Architecture

A Chrome extension running on YouTube pages extracts subtitles and pushes them to the app. This replaces the agent skill pipeline (yt-dlp + LLM) with a faster, deterministic flow.

## Why an extension

Content scripts on `youtube.com` have same-origin access — they can call YouTube's internal APIs (`youtubei/v1/player`, `timedtext`) without CORS restrictions. This is the same approach as v4 and Language Reactor.

## How subtitle fetching works

YouTube's subtitle system has two layers of protection:

1. **CORS** — the `timedtext` API is on `youtube.com`, so cross-origin requests are blocked. Being on the YouTube page (same-origin) solves this.

2. **POT (Proof of Origin Token)** — YouTube's WEB client requires a `pot` parameter on `timedtext` requests, generated at runtime by botguard JS. The `baseUrl`s from `ytInitialPlayerResponse` lack this token, so fetching them directly returns empty responses.

The workaround (from yt-dlp): call `youtubei/v1/player` with **iOS client headers** from the YouTube page. Mobile clients (`IOS`, `ANDROID`, `ANDROID_VR`) don't require SUBS POT — mobile apps have their own attestation (App Store, device integrity), so YouTube doesn't layer browser-based botguard on top. The caption `baseUrl`s from the iOS client response work without POT.

**Same-origin solves CORS, iOS client identity solves POT.** Two orthogonal problems.

This approach is fragile — YouTube can break it by requiring SUBS POT for mobile clients. We track yt-dlp's workarounds (`docs/skills/yt-dlp/SKILL.md`) to stay current.

## Architecture

The extension is a thin shell. Core logic (extraction, json3 parsing, alignment) lives in shared modules (`src/lib/youtube.ts`) reusable by both the extension and tests. See `docs/tasks/2026-03-08-browser-extension.md` for the implementation plan.
