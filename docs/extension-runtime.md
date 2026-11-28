# Extension Runtime

The extension runs as five separate pieces of JavaScript. Each one can do things the others can't, so most features need several of them to work together. This doc explains what each piece is for and how they send messages to each other.

![Each YouTube tab runs the content script and the relay, and the relay mounts a hidden storage frame from the extension. The content script calls the background through the relay, and reads and writes storage through the frame, which sends change notices back. The frame, the bookmarks page, and the background all open the same IndexedDB on the extension's origin.](images/extension-runtime.svg)

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

The main world has no `chrome.runtime` to build the frame's URL, so the relay mounts the frame. The two load in either order. The frame announces itself when it starts, and the content script sends a hello that the frame answers, so the content script finds the frame whichever loads first. After that, the content script sends each read or write to the frame with `postMessage`, and the frame posts the result back. Both sides check the other's origin on every message. The frame answers only youtube.com, and it calls whichever storage method a message names, so a method added to the storage reaches the content script without any wiring. The session token isn't in this storage, so the frame never offers it. YouTube's own scripts share the main world and can call the frame too, but they could already read the youtube.com storage that held this data before, and they could already overwrite any session through the writes the caption panel needs, so serving the rest of the storage exposes nothing new.

If the extension updates while a tab is open, the tab's frame stops answering. A call that gets no answer fails with a message to reload the page.

## Keep the Index Current After Each Write

The caption panel needs only this video's index entry, for its sync status. It reads the entry through the frame, and reads it again on each change notice.

Every write to the database posts a notice with the new index to listeners on the same page. The frame forwards its notices to its content script, so a YouTube tab's sync status follows the writes that tab makes. Other pages see the write after they reload, as [Know Where an Open Page Can Fall Behind](data-and-sync.md#know-where-an-open-page-can-fall-behind) describes.

## Keep Server Calls and Secrets in the Background

The background service worker holds no UI. It handles calls from the content script and talks to the server.

When the caption panel opens, and again each time you open its menu, the content script asks the background for the video's sync status. The background reads the session token from `chrome.storage.local`, calls the server, and returns whether you're signed in and when the server last changed the video. The token stays out of the content script, which shares its world with YouTube's own scripts. A push from the panel also goes through the background, which reads the session from the database and sends it to the server. A pull from the panel only fetches the session through the background, and the panel applies it to the session it holds. [Data and sync](data-and-sync.md) describes what push and pull do with the data.

## Run the Bookmarks Page as an Extension Page

The bookmarks page is an extension page, so it has the `chrome.*` APIs and the database directly, and needs no relay. It calls the server itself for signing in, listing the server's videos, pushing, pulling, and deleting, and it adds the session token from `chrome.storage.local` to each request. A YouTube tab doesn't need to be open for any of it.
