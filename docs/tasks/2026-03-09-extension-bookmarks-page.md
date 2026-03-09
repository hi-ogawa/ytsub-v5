# Extension Bookmarks Page

## Problem

Extension users create bookmarks on YouTube videos but have no way to see all bookmarked videos at a glance. Need a page listing videos with bookmarks, accessible from the extension icon.

## MVP Scope

Simple video list (like dev-index) with minimal stats (bookmark count, date). No individual bookmark details — just cards linking back to YouTube. Clicking a video opens `youtube.com/watch?v={id}`.

## Storage

Single localStorage key on youtube.com: `zamak:video-index`

```ts
type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string; // ISO
};
// zamak:video-index → VideoIndexEntry[]
```

Updated by MAIN world content script whenever bookmarks change (add/clear). Lightweight — just metadata, no bookmark details.

## Architecture: MAIN ↔ Extension Origin Bridge

**Problem:** Content script runs in `MAIN` world (youtube.com origin). Extension popup runs in extension origin. localStorage/IndexedDB are origin-scoped — popup can't read youtube.com's storage.

**Solution: Dual content scripts + background service worker**

```
MAIN world content script
  → dispatches CustomEvent("zamak:video-index-updated", { detail: entries })

ISOLATED world relay script (relay.ts)
  → listens for CustomEvent, forwards via chrome.runtime.sendMessage()

Background service worker (background.ts)
  → receives message, stores in chrome.storage.local

Extension popup (bookmarks.html)
  → reads chrome.storage.local, renders video list
```

Standard MV3 pattern for MAIN-world scripts needing extension storage.

## Reference Files

| File                             | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `src/lib/caption-session.ts`     | Hook — update to maintain video index on bookmark change |
| `src/lib/extension-bookmarks.ts` | localStorage bookmark CRUD                               |
| `src/extension/content.tsx`      | MAIN world script                                        |
| `src/extension/manifest.json`    | Add background + relay + action                          |

## Implementation Steps

### 1. Video index helper (`src/lib/video-index.ts`)

```ts
const KEY = "zamak:video-index";

type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
};

function getIndex(): VideoIndexEntry[] {
  /* read localStorage */
}
function updateEntry(entry: VideoIndexEntry): void {
  /* upsert by youtubeId, write, dispatch event */
}
function removeEntry(youtubeId: string): void {
  /* filter out, write, dispatch event */
}
```

Dispatches `CustomEvent("zamak:video-index-updated")` after every write so the relay can forward it.

### 2. Integrate into `useCaptionSession`

- After `persistSession()` → call `updateEntry()` with videoMeta + bookmark count
- After `clearBookmarks()` → call `removeEntry()`

### 3. Relay script (`src/extension/relay.ts`)

Thin ISOLATED world content script:

- Listens for `CustomEvent("zamak:video-index-updated")` on `window`
- Forwards `event.detail` to background via `chrome.runtime.sendMessage()`

### 4. Background service worker (`src/extension/background.ts`)

- Receives `{ type: "video-index-updated", payload: VideoIndexEntry[] }`
- Stores in `chrome.storage.local` under `video-index`

### 5. Update manifest

```json
{
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "bookmarks.html" },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "world": "MAIN",
      "run_at": "document_idle"
    },
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["relay.js"],
      "world": "ISOLATED",
      "run_at": "document_idle"
    }
  ]
}
```

### 6. Popup page (`src/extension/bookmarks.html` + `bookmarks.tsx`)

- Read video index from `chrome.storage.local`
- Card list: YouTube thumbnail, title, channel, bookmark count, last updated
- Click → `chrome.tabs.create({ url: "https://www.youtube.com/watch?v={id}" })`
- Dark theme, minimal styling
- Empty state: "No bookmarked videos yet"

### 7. Build config

Add `bookmarks.html`, `background.ts`, `relay.ts` as entry points in extension Vite build.

## Future Ideas

- Expand cards inline to show individual bookmark text/translations
- Full-tab page instead of popup for more space
- Export all bookmarks across videos
- Search/filter across all bookmarked videos

## Status

- [x] Plan created
- [x] Implementation complete (MVP)
