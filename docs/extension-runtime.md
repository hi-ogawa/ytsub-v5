# Extension Runtime

The extension runs as four separate pieces of JavaScript. Each one can do things the others can't, so most features need several of them to work together. This doc explains what each piece is for and how they send messages to each other.

![The content script and the relay run in every YouTube tab and share youtube.com storage. Three BroadcastChannels connect them. The relay talks to the background service worker through Chrome messages and a port. The background calls the server and writes chrome.storage. The bookmarks page reads and writes chrome.storage and calls the background.](images/extension-runtime.svg)

## Split the Content Script Across Two Worlds

Chrome runs content scripts in an isolated world by default. An isolated script shares the page's DOM and storage, but not its JavaScript globals. It can use the `chrome.*` extension APIs. A script in the page's main world is the opposite: it sees the page's globals, but it has no extension APIs.

The extension needs both, so each YouTube tab runs two scripts:

- **The content script** runs in the main world. It reads YouTube's own page config (`ytcfg`) to build subtitle requests, renders the caption panel, and keeps captions and bookmarks in youtube.com storage.
- **The relay** runs in the isolated world. It has no UI. It passes messages between the content script and the rest of the extension, and it copies the video index into `chrome.storage.local`.

The two worlds share the tab's origin, so they read and write the same IndexedDB and localStorage. They can't call each other's functions, so they talk through BroadcastChannels.

## Talk Between the Worlds With BroadcastChannels

Three channels connect the content script and the relay. A BroadcastChannel delivers a message to every other channel object with the same name on the same origin, which means it reaches the other world in the same tab.

- **`zamak:rpc`** carries calls from the content script to the background. The content script posts a request with an ID. The relay forwards it to the background, then posts the result on the same channel, and the content script matches it by ID.
- **`zamak:tab-rpc`** carries calls from the background to the content script. The relay receives a request from the background, posts it on the channel, and waits for the content script to post the result.
- **`zamak:store`** carries changes to the video index. When the content script changes the index, it posts the new index. The relay updates its in-memory copy and writes it to `chrome.storage.local`. When a tab loads, the relay first copies the index from `chrome.storage.local` into localStorage, where the content script reads it.

The same delivery rule has a side effect. A BroadcastChannel can't be limited to one tab, so every message also reaches the relay and the content script in every other open YouTube tab. For `zamak:store`, that keeps open tabs in step, and it can't loop, because a listener only updates its local copy. The two RPC channels don't check whether a message is a request or a response, so with two YouTube tabs open, two relays keep answering each other's messages. This is [issue #184](https://github.com/hi-ogawa/ytsub-v5/issues/184).

## Keep Server Calls and Secrets in the Background

The background service worker is the extension's hub. It holds no UI and no captions. It handles calls from the content script and the bookmarks page, and it talks to the server.

When the caption panel opens, the content script asks the background for the video's sync status. The background reads the session token from `chrome.storage.local`, calls the server, and returns whether you're signed in and when the server last changed the video. The token stays out of the content script, which shares its world with YouTube's own scripts.

## Route Background Calls Through a YouTube Tab

Captions and bookmarks live in IndexedDB on the youtube.com origin. The background service worker and the bookmarks page run on the extension's own origin, so they can't open that database. When the background needs a session, it asks a YouTube tab to read or write it.

To find a tab, the background keeps a list of tabs that are ready. Each relay opens a long-lived port to the background when its tab loads. Chrome closes the port when the tab closes or navigates away, or when the extension updates, so the list only holds tabs running the current extension. The background picks any tab on the list and sends it a Chrome message. The relay passes the request to the content script through `zamak:tab-rpc`, and the content script reads or writes IndexedDB. Every YouTube tab shares the same origin storage, so any tab will do.

This is why pushing and pulling from the bookmarks page needs an open YouTube tab. Without one, the call fails with "No YouTube tab open". [Data and sync](data-and-sync.md) describes what push and pull do with the data.

## Run the Bookmarks Page as an Extension Page

The bookmarks page is an extension page, so it has the `chrome.*` APIs directly and needs no relay. It calls the background with plain Chrome messages for push and pull. It calls the server itself for everything else, such as signing in, listing the server's videos, and deleting a video, and it adds the session token from `chrome.storage.local` to each request.

The page runs on the extension's origin, so it has its own localStorage. It keeps its own copy of the video index there. It loads the copy from `chrome.storage.local` when it opens and writes the whole index back after each change.
