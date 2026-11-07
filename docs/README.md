# Documentation

## Architecture

- [Architecture overview](architecture.md): the problem, the core workflow, the extension, server, and web app layers, how the extension fetches subtitles, the UI surfaces and their `/dev` mirrors, and the data model.

## Concepts

- [YouTube subtitle fetching](concepts/youtube-subtitle-fetching.md): how the extension follows yt-dlp's workarounds to fetch subtitles, and what to check when YouTube breaks it.

## Guides

- [AI integration](ai-integration.md): the copy-paste workflow for filling vocab with any LLM. The app's help link opens this page.
- [Generate import.json from a YouTube video](generate-import-json.md): build captions and vocab bookmarks for a video with yt-dlp and an LLM, for seed fixtures or a one-off import without the extension.
- [E2E tests](e2e.md): how to run, write, and trace the web app, extension, and YouTube e2e tests.
- [Deployment](deployment.md): migrations, deploys, and secrets on Cloudflare Workers and D1.
- [Chrome Web Store submissions](chrome-store-submissions.md): the listing details and the steps for submitting a new version.

## References

- [References](references.md): earlier ytsub versions, and similar language-learning tools built on video subtitles.
