// Declares all localStorage stores that need two-way sync with chrome.storage.local.
//
// Three extension entry points call the setup helpers:
// 1. relay.ts (ISOLATED content script): setupSyncRelay
// 2. background.ts (service worker): syncedStoreUpdated (RPC handler)
// 3. bookmarks.tsx (extension page): hydrateSyncedStores
//
// Chrome APIs are only accessed inside these functions, never at top level,
// so the web app can safely import the stores without triggering chrome errors.

import {
  STORE_UPDATED_EVENT,
  createLocalStorageStore,
} from "./external-store.ts";

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncedAt?: string;
};

const VIDEO_INDEX_KEY = "zamak:video-index";

export const videoIndexStore = createLocalStorageStore<VideoIndexEntry[]>(
  VIDEO_INDEX_KEY,
  [],
);

const SYNCED_STORES = [{ key: VIDEO_INDEX_KEY, store: videoIndexStore }];

// --- Extension sync helpers (chrome APIs behind function boundary) ---

// relay.ts: forward localStorage changes to background via RPC
export function setupSyncRelay(send: (key: string, value: unknown) => void) {
  const syncedKeys = new Set(SYNCED_STORES.map((s) => s.key));
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    if (!syncedKeys.has(key)) return;
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : undefined;
      send(key, value);
    } catch (err) {
      console.warn("[zamak relay]", err);
    }
  });
}

// background.ts: RPC handler — write to chrome.storage.local
export function syncedStoreUpdated({
  key,
  value,
}: {
  key: string;
  value: unknown;
}) {
  chrome.storage.local.set({ [key]: value });
}

// bookmarks.tsx: hydrate localStorage from chrome.storage, then keep in sync
export async function hydrateSyncedStores() {
  const syncedByKey = new Map(SYNCED_STORES.map((s) => [s.key, s.store]));
  for (const [key, store] of syncedByKey) {
    const result = await chrome.storage.local.get(key);
    const stored = result[key];
    if (stored !== undefined) store.set(stored as never);
  }
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    const store = syncedByKey.get(key);
    if (store) chrome.storage.local.set({ [key]: store.get() });
  });
}
