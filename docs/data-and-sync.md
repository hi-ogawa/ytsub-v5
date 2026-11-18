# Data and Sync

Your captions and bookmarks live in the browser first. The server keeps a copy that you push to and pull from by hand, one video at a time. This doc explains what is stored where, how push and pull move a video, and where the copies can drift apart.

![YouTube tabs keep caption sessions in youtube.com IndexedDB and the video index in localStorage. The extension copies the index through chrome.storage.local into the bookmarks page's localStorage. Push and pull move sessions between youtube.com IndexedDB and the server through the background. The web app keeps its own sessions and index and pushes and pulls directly.](images/data-and-sync.svg)

## Keep Each Video as a Caption Session

A caption session holds everything about one video: its title and channel, the two caption tracks you picked, the merged caption rows, and your bookmarks. Each bookmark points at a caption row and a position in its text, and it carries the translation, etymology, and notes that you or the LLM filled in.

The caption panel creates a session the first time captions load for a video, and it saves the whole session after every change. Sessions are stored in IndexedDB, one record per video, keyed by its YouTube ID.

Browser storage belongs to an origin, so where a session lives depends on which page wrote it. The extension's sessions live on youtube.com, because the content script runs there. The web app's sessions live on the web app's own origin. The extension's background and bookmarks page can't read youtube.com storage, which is why they go through a YouTube tab ([Extension runtime](extension-runtime.md) explains how).

## List Videos From a Small Index

Opening every session just to draw the bookmarks page would be slow, so each origin also keeps a video index in localStorage. An entry holds a video's title, channel, and bookmark count, plus two timestamps for sync: when the session last changed locally, and when it was last pushed or pulled.

The extension has three copies of the index, because its pieces run on two origins. YouTube tabs keep one in youtube.com localStorage, the bookmarks page keeps one in the extension's localStorage, and `chrome.storage.local` sits between them. Each side copies the index from `chrome.storage.local` when it loads, and writes its whole index back there after each change.

## Decide the Sync Direction From Three Timestamps

The sync status of a video compares three timestamps: when the local session last changed, when it was last synced, and when the server's copy last changed.

- If neither side changed since the last sync, the video is synced.
- If only the local session changed, it needs a push. If only the server changed, it needs a pull.
- If both changed, it's a conflict, and you pick which copy to keep.
- A video that was never synced needs a push if the server doesn't have it, and it's a conflict if the server does.
- A video that exists only on the server needs a pull.

## Push and Pull Whole Videos

Push and pull always move a whole video, and the receiving side replaces its copy. A push sends the session to the server, which replaces that video's captions and bookmarks. A pull fetches the server's copy and replaces the local session. Either one then records the sync time in the index.

In the extension, you can push or pull from the caption panel's menu or from the bookmarks page. Both ask the background, which calls the server. A push from either one reads the session through an open YouTube tab. A pull from the bookmarks page writes the session through a YouTube tab. A pull from the panel only fetches the session, and the panel applies it itself.

In the web app, the bookmarks page and the caption panel push and pull directly, because the sessions live on its own origin. The web app's caption panel only shows sessions that are already stored, because it can't fetch subtitles.

In both clients, a pull from the caption panel replaces the captions and bookmarks it shows, so you see the pulled copy without a reload. A conflict in the panel opens the bookmarks page, where you pick which copy to keep.

Data can also enter the web app from an `import.json` file, through Import in the header menu. Import writes a session to the web app's storage, and a push then uploads it. [Generate import.json](../skills/zamak/references/generate-import-json.md) describes how to build one without the extension.

## Know Where the Copies Drift Apart

Because each side writes its whole copy, two places can overwrite each other:

- **The extension's index copies only meet at load time.** An open YouTube tab and an open bookmarks page don't see each other's changes, so the next write from one side can undo the other's. [Issue #167](https://github.com/hi-ogawa/ytsub-v5/issues/167) tracks this.
- **Deleting a video on the extension's bookmarks page leaves its session on youtube.com.** The page removes the index entry and the server's copy, but the session it deletes is in the extension origin's IndexedDB, where no session is stored.
