# Data and Sync

Your captions and bookmarks live in the browser first. The server keeps a copy that you push to and pull from by hand, one video at a time. This doc explains what is stored where, how push and pull move a video, and where the copies can drift apart.

![The extension keeps caption sessions and the video index in IndexedDB on its own origin, where YouTube tabs reach it through a hidden frame. The web app keeps the same layout on its own origin. Both push to and pull from the server.](images/data-and-sync.svg)

## Keep Each Video as a Caption Session

A caption session holds everything about one video: its title and channel, the two caption tracks you picked, the merged caption rows, and your bookmarks. Each bookmark points at a caption row and a position in its text, and it carries the translation, etymology, and notes that you or the LLM filled in.

The caption panel creates a session the first time captions load for a video, and it saves the whole session after every change. Sessions are stored in IndexedDB, one record per video, keyed by its YouTube ID.

Browser storage belongs to an origin. The extension keeps its sessions on its own origin, where the bookmarks page, the background, and every YouTube tab can reach them ([Extension runtime](extension-runtime.md) explains how a YouTube tab gets there). The web app keeps its sessions on its own origin.

## List Videos From a Small Index

Opening every session just to draw the bookmarks page would be slow, so the same database also keeps a video index, one entry per video. An entry holds a video's title, channel, and bookmark count, plus two timestamps for sync: when the session last changed locally, and when it was last pushed or pulled.

Saving a session updates its index entry in the same transaction, so the two never disagree. A video gets an entry once it has a bookmark, and keeps it at zero bookmarks so that deleting the last one can still be pushed. Each entry is its own record, so two pages that change different videos at once never overwrite each other.

## Decide the Sync Direction From Three Timestamps

The sync status of a video asks two questions, and both compare against when the video was last synced:

- **Did the local session change?** Compare when it last changed with the last sync.
- **Did the server's copy change?** Compare the server's timestamp for the video with the last sync.

The second question compares the server's clock with the browser's clock. A push or pull records its sync time after the server write it follows, so the write reads as before the sync while the browser's clock isn't behind the server's by more than the time between the two. After a pull, that is the time since the last push. Right after a push, it is only the request's round trip plus the part of a second that the server's timestamp drops, so a browser clock running behind by more than that can show a pull for a video it just pushed.

![Device A pushes, and the server saves serverUpdatedAt at 10:53:10. Device B, whose clock is 2 seconds behind, pulls 5 seconds later and saves syncedAt at 10:53:13 by its own clock, then edits, which sets localUpdatedAt. Right after the pull, localUpdatedAt > syncedAt and serverUpdatedAt > syncedAt are both false, so the video is synced. After the edit, only the local check is true, so the video needs a push. The server check holds while device B's clock is behind by less than the 5 seconds between the push and the pull.](images/sync-state-clocks.svg)

The answers decide the status:

- If neither side changed since the last sync, the video is synced.
- If only the local session changed, it needs a push. If only the server changed, it needs a pull.
- If both changed, it's a conflict, and you pick which copy to keep.
- A video that was never synced needs a push if the server doesn't have it, and it's a conflict if the server does.
- A video that exists only on the server needs a pull.

## Push and Pull Whole Videos

Push and pull always move a whole video, and the receiving side replaces its copy. A push sends the session to the server, which replaces that video's captions and bookmarks. A pull fetches the server's copy and replaces the local session. Either one then records the sync time in the index. A pull also sets the video's local change time to the server's timestamp, so the video keeps its place in the list, which sorts by that time.

The bookmarks page pushes and pulls directly, in both the extension and the web app. The caption panel does too in the web app. In the extension, the panel asks the background, which holds the session token. A pull from the panel only fetches the session, and the panel applies it itself. The web app's caption panel only shows sessions that are already stored, because it can't fetch subtitles.

In both clients, a pull from the caption panel replaces the captions and bookmarks it shows, so you see the pulled copy without a reload. A conflict in the panel opens the bookmarks page, where you pick which copy to keep.

Data can also enter the web app from an `import.json` file, through Import in the header menu. Import writes a session to the web app's storage, and a push then uploads it. [Generate import.json](../skills/zamak/references/generate-import-json.md) describes how to build one without the extension.

## Know Where an Open Page Can Fall Behind

Each page keeps what it shows of the video index in memory and updates it after its own writes. Writes from other pages show up after a reload. So a second YouTube tab keeps the sync status it loaded, and an open bookmarks page doesn't show what a YouTube tab saves, such as a pull.

The caption panel also holds its session in memory while you work, and reads the stored copy only when it opens. If another page saves that video's session while the panel is open, such as a pull from the bookmarks page or an edit in another tab, the panel keeps showing its older copy, and its next edit saves that copy over the newer one.
