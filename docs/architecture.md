# Architecture Overview

## System Shape

Zamak turns YouTube videos into vocabulary study. You watch a video with two caption tracks side by side, bookmark words and phrases, and let any LLM fill in translations, etymology, and notes. The bookmarks stay tied to the caption and the moment in the video where you found them.

The system has three parts:

- **The Chrome extension** is the main client and the only way data enters the system. On a YouTube video page it shows the caption panel, fetches subtitles, and keeps your captions and bookmarks in the browser. It works without an account.
- **The server** keeps a copy of your videos, captions, and bookmarks for access from other devices. It runs as a Cloudflare Worker with a D1 (SQLite) database, and it needs a login. No page reads from it directly. Clients pull data into local storage first.
- **The web app** shows synced data on devices without the extension, such as a phone. It always needs a login. It pulls videos from the server into its own browser storage and renders the same caption panel. It cannot fetch anything from YouTube.

## Fetch Subtitles Where Only the Extension Can

Only a script running on a youtube.com page can get subtitles. The page's origin lets it call YouTube's internal APIs without CORS errors, and the page holds the values that the API calls need. A server or the web app has neither, so all video data comes in through the extension.

YouTube also requires a proof-of-origin token for subtitles requested by its web client. The extension avoids it by asking for the video as a mobile client, the same workaround yt-dlp uses. See [YouTube subtitle fetching](concepts/youtube-subtitle-fetching.md) for how to follow yt-dlp when YouTube breaks this.

## Share One UI Across the Extension and the Web App

The extension and the web app render the same two pages from shared components:

- **The caption panel** shows dual captions and handles bookmarking and the AI workflow. The extension draws it over YouTube's video page inside a shadow root. The web app shows it at `/videos/:id` next to an embedded player.
- **The bookmarks page** lists your bookmarked videos with their sync status. The extension opens it as `bookmarks.html` in a full tab when you click its icon. The web app serves it at `/`.

Reloading an extension on every change is slow, so the web app also has `/dev` routes that render these pages without a login. `/dev/videos/:id` shows the caption panel with fixture data recorded from real videos, and `/dev` shows the bookmarks page. UI work and most e2e tests use these routes instead of YouTube and the extension runtime.

[Extension runtime](extension-runtime.md) explains how the extension's pieces talk to each other. [Data and sync](data-and-sync.md) explains where data is stored and how it moves between the browser and the server.

## Fill Bookmarks With Any LLM

The AI workflow works through the clipboard. The caption panel builds a self-contained prompt with the captions and bookmarks in it. You paste it into any LLM chat and paste the JSON answer back, and the panel applies it. This keeps the workflow independent of the model and the provider, and the prompt stays visible to you. It supports three tasks: pick interesting vocabulary and fill it in, fill in existing bookmarks, and fix errors in auto-generated captions. See [AI integration](ai-integration.md) for the steps.
