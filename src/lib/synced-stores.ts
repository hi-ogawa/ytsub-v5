// Declares all localStorage stores that need two-way sync with chrome.storage.local.
//
// Two extension entry points call the setup helpers:
// 1. relay.ts (ISOLATED content script): setupSyncRelay
// 2. bookmarks.tsx (extension page): hydrateSyncedStores
//
// Chrome APIs are only accessed inside these functions, never at top level,
// so the web app can safely import the stores without triggering chrome errors.

import { STORE_UPDATED_EVENT } from "./external-store.ts";
import { videoIndexStore } from "./video-index.ts";

const SYNCED_STORES = [videoIndexStore];

// --- Extension sync helpers (chrome APIs behind function boundary) ---

// relay.ts (ISOLATED world): listen for DOM events from MAIN world and
// forward to chrome.storage.local. DOM events cross the world boundary;
// in-memory subscribe() does not.
export function setupSyncedStoreRelay() {
  const syncedKeys = new Set(SYNCED_STORES.map((s) => s.storageKey));
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    if (!syncedKeys.has(key)) return;
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : undefined;
      chrome.storage.local.set({ [key]: value });
    } catch (err) {
      console.warn("[zamak relay]", err);
    }
  });
}

// bookmarks.tsx: hydrate localStorage from chrome.storage, then keep in sync
export async function hydrateSyncedStores() {
  for (const store of SYNCED_STORES) {
    const result = await chrome.storage.local.get(store.storageKey);
    const stored = result[store.storageKey];
    if (stored !== undefined) store.set(stored as never);
  }
  for (const store of SYNCED_STORES) {
    store.subscribe(() => {
      chrome.storage.local.set({ [store.storageKey]: store.get() });
    });
  }
}
