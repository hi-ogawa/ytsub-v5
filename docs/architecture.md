# Architecture Overview

## System Shape

This doc explains how Zamak is built. [Product overview](product.md) explains what it does for a learner.

The system has three parts:

- **The Chrome extension** is the main client and the only part that can fetch videos from YouTube. It keeps captions and bookmarks in the browser and runs without the server.
- **The server** is a Cloudflare Worker with a D1 (SQLite) database. It serves the web app's pages and the API that both clients call, and it stores each user's videos, captions, and bookmarks. No page renders from it directly. Clients pull data into their own browser storage first.
- **The web app** is a client on its own origin, served by the server. It needs the server for every page, because each page checks the login first. It keeps pulled videos in its own browser storage and renders the same pages as the extension.

No part calls an AI service. The LLM step goes through the user's clipboard, so the caption panel only builds the prompt and parses the answer that the user pastes back.

## Fetch Subtitles Where Only the Extension Can

Only a script running on a youtube.com page can get subtitles. The page's origin lets it call YouTube's internal APIs without CORS errors, and the page holds the values that the API calls need. A server or the web app has neither, so new videos come from the extension. The other way in is an `import.json` file imported into the web app, which the extension exports or a yt-dlp script builds.

YouTube also requires a proof-of-origin token for subtitles requested by its web client. The extension avoids it by asking for the video as a mobile client, the same workaround yt-dlp uses. See [YouTube subtitle fetching](concepts/youtube-subtitle-fetching.md) for how to follow yt-dlp when YouTube breaks this.

## Share One UI Across the Extension and the Web App

The extension and the web app render the same two pages from shared components:

- **The caption panel** shows dual captions and handles bookmarking and the AI workflow. The extension draws it over YouTube's video page inside a shadow root. The web app shows it at `/videos/:id` next to an embedded player, and `?t=<seconds>` plays it from just before that time, as links from Anki cards do.
- **The bookmarks page** lists your bookmarked videos with their sync status. The extension opens it as `bookmarks.html` in a full tab when you click its icon. The web app serves it at `/`.

The pages differ where the two surfaces do. The web app can't fetch from YouTube, so its caption panel only opens a session already pulled from the server, and it has no controls for building a new one:

|                                              | 🧩 Extension               | 🌐 Web app                 |
| -------------------------------------------- | -------------------------- | -------------------------- |
| Works without login                          | ✅ login only to sync      | ❌                         |
| Caption source                               | ▶️ YouTube's tracks        | ☁️ pulled session only     |
| Track picker, alignment strategy             | ✅                         | ❌ language label          |
| Starts a new session                         | ✅                         | ❌ pull first              |
| Floating, resizable panel                    | ✅                         | ❌ fixed beside the player |
| Player                                       | ▶️ YouTube's video element | 📺 YouTube embed           |
| Runs on phones                               | ❌                         | ✅                         |
| Bookmarks, AI prompts, export, push and pull | ✅                         | ✅                         |

[Extension runtime](extension-runtime.md) explains how the extension's pieces talk to each other. [Data and sync](data-and-sync.md) explains where data is stored and how it moves between the browser and the server.
