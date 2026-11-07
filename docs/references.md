# References

## Prior Repositories

### ytsub (v1) — archived

- **Repo**: https://github.com/hi-ogawa/ytsub
- **Language**: HTML (vanilla JS)
- **Last pushed**: 2022-01
- **What**: YouTube Subtitles Viewer. Deployed on Vercel.
- **Backend**: Separate repo (`ytsub-backend`) — Python, Docker, DB.

### ytsub-v2 — archived

- **Repo**: https://github.com/hi-ogawa/ytsub-v2
- **Language**: TypeScript (webpack, pnpm)
- **Last pushed**: 2022-03
- **What**: Rewrite of v1 in TypeScript. Deployed on Netlify.

### ytsub-v3 — archived

- **Repo**: https://github.com/hi-ogawa/ytsub-v3
- **Language**: TypeScript (Remix, Playwright, Vitest)
- **Last pushed**: 2024-04
- **Description**: "Anki-like language learning app built with Remix"
- **What**: Full-stack app with DB (PlanetScale), auth, Knex migrations. Deployed on Vercel.
- **Note**: Shutdown when PlanetScale closed hobby plan.

### ytsub-v4 — active

- **Repo**: https://github.com/hi-ogawa/ytsub-v4
- **Language**: TypeScript (pnpm)
- **Last pushed**: 2026-02-15
- **What**: Latest iteration. Minimal README (`pnpm dev`).

### ytsub-backend — active (stale)

- **Repo**: https://github.com/hi-ogawa/ytsub-backend
- **Language**: Python
- **Last pushed**: 2021-09
- **What**: Backend for v1. Python, Docker, DB.

### Related

#### yt-dlp-gui — active

- **Repo**: https://github.com/hi-ogawa/yt-dlp-gui
- **Language**: TypeScript (Electron/AppImage)
- **Last pushed**: 2025-09
- **What**: Desktop GUI for yt-dlp. Alternative to youtube-dl-web-v2.

#### youtube-dl-web-v2 — archived

- **Repo**: https://github.com/hi-ogawa/youtube-dl-web-v2
- **Language**: TypeScript
- **Last pushed**: 2024-12
- **Description**: Wasm showcase for webm/opus remuxing and fast-seeking on browser.
- **Note**: Archived since YouTube API became inaccessible.

### Evolution Summary

v1 (HTML+Python backend) → v2 (TS rewrite, frontend-only) → v3 (full-stack Remix, Anki-like SRS) → v4 (active, details TBD)

Key progression: started as a subtitle viewer, grew into a language learning app with SRS by v3.

## Similar Projects

### Language Reactor (the famous one)

Formerly "Language Learning with Netflix" (LLN), renamed 2021. The pioneer in this space.

- **URL**: https://www.languagereactor.com/
- **What**: Chrome extension — dual subtitles, popup dictionary, playback controls on YouTube, Netflix, Coursera, etc.
- **Key features**: dual subs, click-to-translate, PhrasePump (sentence practice), vocab saving, Anki export (Pro), AI chatbot
- **Pricing**: Free basic / ~$5/mo Pro
- **Tech**: Chrome extension injecting UI overlay; parses subtitle tracks + translation APIs

### Trancy

- **URL**: https://www.trancy.org/
- **What**: AI-powered bilingual subtitles for YouTube, Netflix, Udemy, Disney+, TED, etc.
- **Key features**: AI-generated subtitles (Whisper-based) even when none exist, dual subs, hover-translate, AI video summary, speaking practice
- **Pricing**: Free basic / ~$10/mo or ~$28/yr
- **Tech**: Chrome extension, AI transcription

### Migaku

- **URL**: https://migaku.com/
- **What**: Comprehensive platform — browser extension + mobile app with built-in SRS
- **Key features**: interactive subtitles, one-click flashcard creation (screenshot + audio + context), built-in SRS, AI word explanations, structured courses
- **Pricing**: $9-14/mo, $399 lifetime
- **Tech**: Chrome extension + mobile app. Originally Japanese-focused. Heavy Anki-like SRS pipeline integrated with video content.

### Sabi

- **URL**: https://www.joinsabi.com/
- **What**: Turns YouTube/Netflix into interactive language learning games
- **Key features**: dual subs + Whisper AI subs, hover-translate, adaptive comprehension exercises, gamified
- **Pricing**: ~$2-3/mo
- **Tech**: Chrome extension, Whisper for subtitle generation, AI-generated exercises

### InterSub

- **URL**: https://intersub.cc/
- **What**: Interactive dual subtitles on YouTube, Netflix, etc.
- **Key features**: dual subs, AI translator, hover-translate, personal wordbook, AI chat buddy, RTL support
- **Pricing**: Free tier / ~$5/mo
- **Tech**: Chrome extension, cross-browser (Chrome, Edge, Firefox)

### FluentU

- **URL**: https://www.fluentu.com/
- **What**: Full learning platform built around authentic video content
- **Key features**: interactive captions, curated video library, SRS review, beginner courses, Chrome extension
- **Pricing**: ~$12-30/mo
- **Tech**: Standalone web platform + Chrome extension. Curated pre-annotated content.

### Quick Comparison

| Tool             | $/mo  | Dual Subs | Click Translate | SRS/Flashcards     | Exercises        | AI Features            |
| ---------------- | ----- | --------- | --------------- | ------------------ | ---------------- | ---------------------- |
| Language Reactor | 0-5   | yes       | yes             | save + Anki export | PhrasePump       | chatbot                |
| Trancy           | 0-10  | yes       | yes             | yes                | speaking eval    | transcription, summary |
| Migaku           | 9-14  | yes       | yes             | built-in SRS       | courses          | explanations           |
| Sabi             | 2-3   | yes       | yes             | yes                | adaptive quizzes | Whisper subs           |
| InterSub         | 0-5   | yes       | yes             | wordbook           | no               | chat buddy             |
| FluentU          | 12-30 | yes       | yes             | built-in SRS       | quizzes          | curated content        |

### Sources

- https://www.languagereactor.com/
- https://www.trancy.org/
- https://migaku.com/
- https://www.joinsabi.com/
- https://intersub.cc/
- https://www.fluentu.com/
