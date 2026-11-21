# Documentation

## Overview

- [Product overview](product.md): the problem Zamak solves, the four study steps, and the three setups: extension only, with an account, and with the web app.
- [Architecture overview](architecture.md): the extension, server, and web app, why only the extension can fetch subtitles, and the shared UI and its `/dev` mirrors.
- [Extension runtime](extension-runtime.md): the content script, relay, background, and bookmarks page, the channels between them, and why the background goes through a YouTube tab.
- [Data and sync](data-and-sync.md): caption sessions and the video index in each origin's storage, how sync status is decided, what push and pull replace, and where copies drift apart.

## Concepts

- [YouTube subtitle fetching](concepts/youtube-subtitle-fetching.md): how the extension follows yt-dlp's workarounds to fetch subtitles, and what to check when YouTube breaks it.

## Guides

- [E2E tests](e2e.md): how to run, write, and trace the web app, extension, and YouTube e2e tests.
- [Deployment](deployment.md): migrations, deploys, and secrets on Cloudflare Workers and D1.
- [Chrome Web Store submissions](chrome-store-submissions.md): the listing details and the steps for submitting a new version.

## Agent Skills

- [Zamak skill](../skills/zamak/SKILL.md): the AI tasks that the app's prompts and its AI prompt help link point to, with the agent guides it links:
  - [Generate import.json from a YouTube video](../skills/zamak/references/generate-import-json.md): build captions and vocab bookmarks for a video with yt-dlp and an LLM for a one-off import without the extension, or for a seed fixture.
  - [Use the server API](../skills/zamak/references/server-api.md): log in, read a video, and edit its bookmarks from a script or agent, and keep the server's copy current.
- [Burned-in captions skill](../skills/burned-in-captions/SKILL.md): read the captions burned into a video's picture into a timed track, for Fix & Align ASR on Korean videos that have only ASR.

## References

- [References](references.md): earlier ytsub versions, and similar language-learning tools built on video subtitles.
