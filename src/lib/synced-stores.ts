// Registry of localStorage stores that need two-way sync with chrome.storage.local.
//
// Three sync points use this registry:
// 1. relay.ts (ISOLATED content script): localStorage change → bgRpc.syncedStoreUpdated
// 2. background.ts (service worker): syncedStoreUpdated → chrome.storage.local.set
// 3. bookmarks.tsx (extension page): hydrate localStorage from chrome.storage on init,
//    then listen for localStorage changes to write back to chrome.storage

import {
  type ExternalStore,
  createLocalStorageStore,
  storeEventName,
} from "./external-store.ts";

interface SyncedStoreEntry<T = unknown> {
  key: string;
  store: ExternalStore<T>;
  eventName: string;
}

const registry: SyncedStoreEntry[] = [];

export function createSyncedStore<T>(
  key: string,
  defaultValue: T,
): ExternalStore<T> {
  const store = createLocalStorageStore<T>(key, defaultValue);
  registry.push({
    key,
    store: store as ExternalStore<unknown>,
    eventName: storeEventName(key),
  });
  return store;
}

export function getSyncedStores(): readonly SyncedStoreEntry[] {
  return registry;
}
