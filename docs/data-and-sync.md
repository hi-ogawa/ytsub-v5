# Data and Sync

Your captions and bookmarks live in the browser first. The server keeps a copy that you push to and pull from by hand, one video at a time. This doc explains what is stored where, how push and pull move a video, and where the copies can drift apart.

![The extension keeps caption sessions and the video index in IndexedDB on its own origin, where YouTube tabs reach it through a hidden frame. The web app keeps the same layout on its own origin. Both push to and pull from the server.](images/data-and-sync.svg)

## Keep Each Video as a Caption Session

A caption session holds everything about one video: its title and channel, the two caption tracks you picked, the merged caption rows, and your bookmarks. Each bookmark points at a caption row and a position in its text, and it carries the translation, etymology, and notes that you or the LLM filled in.

The caption panel creates a session the first time captions load for a video, and it saves the whole session after every change. Sessions are stored in IndexedDB, one record per video, keyed by its YouTube ID.

A new session is saved before the panel shows it, so picking two tracks is enough for the video to reopen with them, even with no bookmarks yet. When the panel opens, it reads the saved session and asks YouTube for the video's caption tracks at the same time. The saved session needs nothing from YouTube, so it shows even when YouTube refuses the request, and only a video with nothing saved has to wait for the tracks.

Browser storage belongs to an origin. The extension keeps its sessions on its own origin, where the bookmarks page, the background, and every YouTube tab can reach them ([Extension runtime](extension-runtime.md) explains how a YouTube tab gets there). The web app keeps its sessions on its own origin.

## List Videos From a Small Index

Opening every session just to draw the bookmarks page would be slow, so the same database also keeps a video index, one entry per video. An entry holds a video's title, channel, and bookmark count, plus timestamps for sync: when the session last changed locally, when it was last pushed or pulled, and the server's own timestamp for the video at that push or pull.

Saving a session updates its index entry in the same transaction, so the two never disagree. A video gets an entry once it has a bookmark, and keeps it at zero bookmarks so that deleting the last one can still be pushed. Until then, its session is stored but the video isn't listed anywhere. A pull from the bookmarks page adds the entry even with no bookmarks, so the pulled video shows up in the list. Each entry is its own record, so two pages that change different videos at once never overwrite each other.

## Decide the Sync Direction From Two Pairs of Timestamps

The sync status of a video asks two questions, and each one compares timestamps from a single clock, because the browser's clock and the server's clock can disagree:

- **Did the local session change?** Compare when it last changed with when it was last synced, both from the browser's clock.
- **Did the server's copy change?** Compare when it last changed with what that time was at the last sync, both from the server's clock. A push or pull records the server's time from its own response.

![Device A pushes, and the server saves serverUpdatedAt. Device B, whose clock is three minutes behind, pulls and saves syncedServerUpdatedAt, a copy of the server's time, and syncedAt from its own clock, then edits, which sets localUpdatedAt. Right after the pull, localUpdatedAt > syncedAt and serverUpdatedAt > syncedServerUpdatedAt are both false, so the video is synced. After the edit, only the local check is true, so the video needs a push. Each check compares two times from one clock. Mixing clocks, serverUpdatedAt > syncedAt would read as a server change: a pull right after the pull, and a conflict after the edit.](images/sync-state-clocks.svg)

The answers decide the status:

- If neither side changed since the last sync, the video is synced.
- If only the local session changed, it needs a push. If only the server changed, it needs a pull.
- If both changed, it's a conflict, and you pick which copy to keep.
- A video that was never synced needs a push if the server doesn't have it, and it's a conflict if the server does.
- A video that exists only on the server needs a pull.

## Push and Pull Whole Videos

Push and pull always move a whole video, and the receiving side replaces its copy. A push sends the session to the server, which replaces that video's captions and bookmarks. A pull fetches the server's copy and replaces the local session. Either one then records the sync time and the server's timestamp in the index.

The bookmarks page pushes and pulls directly, in both the extension and the web app. The caption panel does too in the web app. In the extension, the panel asks the background, which holds the session token. A pull from the panel only fetches the session, and the panel applies it itself. The web app's caption panel only shows sessions that are already stored, because it can't fetch subtitles.

In both clients, a pull from the caption panel replaces the captions and bookmarks it shows, so you see the pulled copy without a reload. A conflict in the panel opens the bookmarks page, where you pick which copy to keep.

Data can also enter the web app from an `import.json` file, through Import in the header menu. Import writes a session to the web app's storage, and a push then uploads it. [Generate import.json](../skills/zamak/references/generate-import-json.md) describes how to build one without the extension.

## Know Where an Open Page Can Fall Behind

Each page keeps what it shows of the video index in memory and updates it after its own writes. Writes from other pages show up after a reload. So a second YouTube tab keeps the sync status it loaded, and an open bookmarks page doesn't show what a YouTube tab saves, such as a pull.

The caption panel also holds its session in memory while you work, and reads the stored copy only when it opens. If another page saves that video's session while the panel is open, such as a pull from the bookmarks page or an edit in another tab, the panel keeps showing its older copy, and its next edit saves that copy over the newer one.
