// Declares all localStorage stores that need two-way sync with chrome.storage.local.
//
// Three sync points use this list:
// 1. relay.ts (ISOLATED content script): localStorage change → bgRpc.syncedStoreUpdated
// 2. background.ts (service worker): syncedStoreUpdated → chrome.storage.local.set
// 3. bookmarks.tsx (extension page): hydrate localStorage from chrome.storage on init,
//    then listen for localStorage changes to write back to chrome.storage

import { createLocalStorageStore, storeEventName } from "./external-store.ts";
import type { VideoIndexEntry } from "./video-index.ts";

const VIDEO_INDEX_KEY = "zamak:video-index";

export const videoIndexStore = createLocalStorageStore<VideoIndexEntry[]>(
  VIDEO_INDEX_KEY,
  [],
);

export const SYNCED_STORES = [
  {
    key: VIDEO_INDEX_KEY,
    store: videoIndexStore,
    eventName: storeEventName(VIDEO_INDEX_KEY),
  },
];
