// Declares all localStorage stores that need two-way sync with chrome.storage.local.
//
// Extension entry points call the setup helpers:
// - relay.ts (ISOLATED content script): setupSyncedStoreRelay
// - bookmarks.tsx (extension page): setupSyncedStoresForExtensionPage
//
// Chrome APIs are only accessed inside these functions, never at top level,
// so the web app can safely import the stores without triggering chrome errors.

import { STORE_UPDATED_EVENT } from "./external-store.ts";
import { videoIndexStore } from "./video-index.ts";

const SYNCED_STORES = [videoIndexStore];
const storesByKey = new Map(SYNCED_STORES.map((s) => [s.storageKey, s]));

// --- Extension sync helpers (chrome APIs behind function boundary) ---

// relay.ts (ISOLATED world): two-way sync between localStorage and chrome.storage.
// - DOM STORE_UPDATED_EVENT (from MAIN world) → chrome.storage.local.set
// - chrome.storage.onChanged (from extension page) → localStorage + DOM event for MAIN world
export function setupSyncedStoreRelay() {
  let writingFromChromeStorage = false;

  // MAIN world → chrome.storage
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    if (writingFromChromeStorage) return;
    const key = (e as CustomEvent<string>).detail;
    if (!storesByKey.has(key)) return;
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : undefined;
      chrome.storage.local.set({ [key]: value });
    } catch (err) {
      console.warn("[zamak relay]", err);
    }
  });

  // chrome.storage → localStorage (+ DOM event so MAIN world re-reads)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    writingFromChromeStorage = true;
    try {
      for (const [key, change] of Object.entries(changes)) {
        if (!storesByKey.has(key)) continue;
        localStorage.setItem(key, JSON.stringify(change.newValue));
        window.dispatchEvent(
          new CustomEvent(STORE_UPDATED_EVENT, { detail: key }),
        );
      }
    } finally {
      writingFromChromeStorage = false;
    }
  });
}

// bookmarks.tsx: hydrate localStorage from chrome.storage, then keep in sync both ways.
export async function setupSyncedStoresForExtensionPage() {
  let writingFromChromeStorage = false;

  // Initial hydration: chrome.storage → in-memory store
  for (const store of SYNCED_STORES) {
    const result = await chrome.storage.local.get(store.storageKey);
    const stored = result[store.storageKey];
    if (stored !== undefined) store.setLocal(stored as never);
  }

  // store.set() → chrome.storage (via subscribe, guarded to break loop)
  for (const store of SYNCED_STORES) {
    store.subscribe(() => {
      if (writingFromChromeStorage) return;
      chrome.storage.local.set({ [store.storageKey]: store.get() });
    });
  }

  // chrome.storage.onChanged → in-memory store (setLocal to avoid loop)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    writingFromChromeStorage = true;
    try {
      for (const [key, change] of Object.entries(changes)) {
        const store = storesByKey.get(key);
        if (store) store.setLocal(change.newValue as never);
      }
    } finally {
      writingFromChromeStorage = false;
    }
  });
}
