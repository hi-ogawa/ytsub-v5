# Extension Runtime

The extension runs as four separate pieces of JavaScript. Each one can do things the others can't, so most features need several of them to work together. This doc explains what each piece is for and how they send messages to each other.

![The content script and the relay run in every YouTube tab and share youtube.com storage. Window messages carry RPC between them, and a BroadcastChannel carries video index changes. The relay talks to the background service worker through Chrome messages. The background calls the server and writes chrome.storage. The bookmarks page reads and writes chrome.storage and calls the background.](images/extension-runtime.svg)

## Split the Content Script Across Two Worlds

Chrome runs content scripts in an isolated world by default. An isolated script shares the page's DOM and storage, but not its JavaScript globals. It can use the `chrome.*` extension APIs. A script in the page's main world is the opposite: it sees the page's globals, but it has no extension APIs.

The extension needs both, so each YouTube tab runs two scripts:

- **The content script** runs in the main world. It reads YouTube's own page config (`ytcfg`) to build subtitle requests, renders the caption panel, and keeps captions and bookmarks in youtube.com storage.
- **The relay** runs in the isolated world. It has no UI. It passes messages between the content script and the rest of the extension, and it copies the video index into `chrome.storage.local`.

The two worlds share the tab's origin, so they read and write the same IndexedDB and localStorage. They can't call each other's functions, so they send each other messages.

## Talk Between the Worlds in One Tab

Three channels connect the content script and the relay. Each one works in a single direction:

| Channel         | Who starts it                                 | Who answers                       | What comes back |
| --------------- | --------------------------------------------- | --------------------------------- | --------------- |
| `zamak:rpc`     | The content script                            | The background, through the relay | A response      |
| `zamak:tab-rpc` | The background, through the relay             | The content script                | A response      |
| `zamak:store`   | Either world, when it changes the video index | Nobody                            | Nothing         |

- **`zamak:rpc`** lets the content script call the background, such as to check the sync status. The content script posts a request with an ID. The relay forwards it to the background, then posts the response, and the content script matches it by ID. The background never starts a call on this channel.
- **`zamak:tab-rpc`** is the same in reverse. The background sends a request to the relay, the relay posts it to the content script, and the content script posts the response. The content script never starts a call on this channel.
- **`zamak:store`** is a change notice, not a call. When the content script changes the index, it posts the new index, and the relay writes it to `chrome.storage.local`. When `chrome.storage.local` changes, such as on load or after a write from the bookmarks page, the relay posts the new index, and the content script updates its copy. The relay posts on load even though it also writes localStorage, because the content script may have read localStorage before the relay ran.

The two RPC channels use window messages, because both worlds share the tab's `window` and a window message never leaves the tab. Each message is also tagged as a request or a response, so a listener never answers a response.

`zamak:store` uses a BroadcastChannel, which reaches every channel with the same name on the same origin. That includes every other open YouTube tab, so a change in one tab also updates the index in the others. It can't loop, because a listener only updates its local copy and never posts again, and the relay skips writing an index that matches what `chrome.storage.local` already holds. The RPC channels can't use one for this reason: a request would reach the relays in every tab, and their responses would reach every tab too. That was [issue #184](https://github.com/hi-ogawa/ytsub-v5/issues/184), which froze the browser with two YouTube tabs open.

## Keep Server Calls and Secrets in the Background

The background service worker is the extension's hub. It holds no UI and no captions. It handles calls from the content script and the bookmarks page, and it talks to the server.

When the caption panel opens, and again each time you open its menu, the content script asks the background for the video's sync status. The background reads the session token from `chrome.storage.local`, calls the server, and returns whether you're signed in and when the server last changed the video. The token stays out of the content script, which shares its world with YouTube's own scripts.

## Route Background Calls Through a YouTube Tab

Captions and bookmarks live in IndexedDB on the youtube.com origin. The background service worker and the bookmarks page run on the extension's own origin, so they can't open that database. When the background needs a session, it asks a YouTube tab to read or write it.

To find a tab, the background asks Chrome for the open YouTube tabs on every call and sends a Chrome message to each in turn until one answers. A tab answers once its relay is running. A tab that is still loading, or that runs a script from an older version of the extension, has no relay to answer, so the background moves on to the next tab. The relay passes the request to the content script through `zamak:tab-rpc`, and the content script reads or writes IndexedDB. Every YouTube tab shares the same origin storage, so any tab will do. The background keeps no list of its own, because Chrome stops the service worker when it is idle, and anything the worker kept in memory is lost.

This is why pushing and pulling from the bookmarks page needs an open YouTube tab. Without one, the call fails with "No YouTube tab open". The caption panel runs in a YouTube tab, so its push always finds one. Its pull doesn't go through a tab. The background only returns the fetched session, and the panel applies it to the session it holds in memory. A write to IndexedDB from outside the panel, such as a pull from the bookmarks page, would leave it showing the old copy, so the content script that writes it posts the video ID on a `zamak:session-saved` BroadcastChannel, and a panel showing that video rereads its session. [Data and sync](data-and-sync.md) describes what push and pull do with the data.

## Run the Bookmarks Page as an Extension Page

The bookmarks page is an extension page, so it has the `chrome.*` APIs directly and needs no relay. It calls the background with plain Chrome messages for push and pull. It calls the server itself for everything else, such as signing in, listing the server's videos, and deleting a video, and it adds the session token from `chrome.storage.local` to each request.

The page runs on the extension's origin, so it has its own localStorage. It keeps its own copy of the video index there. It loads the copy from `chrome.storage.local` when it opens, writes the whole index back after each change, and applies changes that YouTube tabs write there.
