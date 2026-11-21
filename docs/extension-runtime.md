# Extension Runtime

The extension runs as five separate pieces of JavaScript. Each one can do things the others can't, so most features need several of them to work together. This doc explains what each piece is for and how they send messages to each other.

![Each YouTube tab runs the content script and the relay, and the relay mounts a hidden storage frame from the extension. The content script calls the background through the relay, and reads and writes storage through the frame, which sends change notices back. The frame, the bookmarks page, and the background all open the same IndexedDB on the extension's origin. A BroadcastChannel carries each write's notice to every page on that origin. Earlier versions' data in youtube.com storage is read once to migrate it.](images/extension-runtime.svg)

## Split the Content Script Across Two Worlds

Chrome runs content scripts in an isolated world by default. An isolated script shares the page's DOM, but not its JavaScript globals. It can use the `chrome.*` extension APIs. A script in the page's main world is the opposite: it sees the page's globals, but it has no extension APIs.

The extension needs both, so each YouTube tab runs two scripts:

- **The content script** runs in the main world. It reads YouTube's own page config (`ytcfg`) to build subtitle requests and renders the caption panel.
- **The relay** runs in the isolated world. It has no UI. It forwards the content script's calls to the background, and it mounts the storage frame.

The two worlds can't call each other's functions, so they send each other window messages on the `zamak:rpc` channel. The content script posts a request with an ID. The relay forwards it to the background, then posts the response, and the content script matches it by ID. A window message never leaves the tab, and each message is tagged as a request or a response, so a listener never answers a response. A BroadcastChannel would reach the relays in every YouTube tab, and their responses would reach every tab too. That was [issue #184](https://github.com/hi-ogawa/ytsub-v5/issues/184), which froze the browser with two YouTube tabs open.

## Keep Data on the Extension's Origin

Browser storage belongs to an origin. If the content script stored captions itself, they would land in youtube.com storage, which the bookmarks page and the background can't open. So the extension keeps sessions and the video index in IndexedDB on its own origin, and every piece reaches the same database:

- **The bookmarks page and the background** run on the extension's origin, so they open the database directly.
- **The content script** runs on youtube.com, so it goes through a hidden storage frame. The frame is a page from the extension, loaded in an iframe, so it runs on the extension's origin and opens the same database. Chrome gives an extension frame the same storage as the extension's own pages when the extension has host permission for the site around it.

The main world has no `chrome.runtime` to build the frame's URL, so the relay mounts the frame. The two load in either order. The frame announces itself when it starts, and the content script sends a hello that the frame answers, so the content script finds the frame whichever loads first. After that, the content script sends each read or write to the frame with `postMessage`, and the frame posts the result back. Both sides check the other's origin on every message. The frame answers only youtube.com and offers only the reads and writes the caption panel needs, never the session token. YouTube's own scripts share the main world, but they could already read the youtube.com storage that held this data before, so the frame exposes nothing new.

If the extension updates while a tab is open, the tab's frame stops answering. A call that gets no answer fails with a message to reload the page.

## Announce Each Write to Every Page

The caption panel needs only this video's index entry, for its sync status. It reads the entry through the frame, and reads it again on each change notice.

Every write to the database posts a notice on the `zamak:storage` BroadcastChannel, which reaches every context on the extension's origin: the frame in each YouTube tab, the bookmarks page, and the background. A notice carries the new index after an index change, or the ID of a video whose session was saved. Each frame forwards notices to its content script. A listener only updates what it shows and never writes back, so notices can't loop.

The session notice keeps an open caption panel current. The panel holds its session in memory while you work, so when another context saves that video's session, such as a pull from the bookmarks page or an edit in another tab, the panel loads the saved copy again. It skips notices for its own writes.

## Keep Server Calls and Secrets in the Background

The background service worker holds no UI. It handles calls from the content script and talks to the server.

When the caption panel opens, and again each time you open its menu, the content script asks the background for the video's sync status. The background reads the session token from `chrome.storage.local`, calls the server, and returns whether you're signed in and when the server last changed the video. The token stays out of the content script, which shares its world with YouTube's own scripts. A push from the panel also goes through the background, which reads the session from the database and sends it to the server. A pull from the panel only fetches the session through the background, and the panel applies it to the session it holds. [Data and sync](data-and-sync.md) describes what push and pull do with the data.

## Run the Bookmarks Page as an Extension Page

The bookmarks page is an extension page, so it has the `chrome.*` APIs and the database directly, and needs no relay. It calls the server itself for signing in, listing the server's videos, pushing, pulling, and deleting, and it adds the session token from `chrome.storage.local` to each request. A YouTube tab doesn't need to be open for any of it.

## Move Data From youtube.com Once

Earlier versions kept sessions and the index in youtube.com storage. The first watch page that loads after the update reads that data and sends it through the frame, and the frame writes it in one transaction that also records that the move is done. Two tabs loading together write it once, because the second transaction sees the record. A load that stops partway writes nothing, so the next watch page tries again. The youtube.com copy stays in place, so a failed move or a downgrade loses nothing.

Before the move, the bookmarks page's list is empty, and it asks you to open a YouTube video once. [Data and sync](data-and-sync.md#move-earlier-data-without-losing-changes) explains which copy wins when a video is in both places.
