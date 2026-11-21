// Hidden extension frame on the watch page. It opens IndexedDB on the extension
// origin for the content script. docs/extension-runtime.md explains the bridge.

import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import type {
  LegacyData,
  StorageNotice,
  VideoIndexEntry,
} from "../lib/caption-storage.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { serveFrameRpc } from "./lib/frame-rpc.ts";
import { YOUTUBE_ORIGIN } from "./lib/storage-bridge.ts";

const storage = idbCaptionStorage;

// Before the move, the extension kept a second copy of the index in
// chrome.storage.local, and the two copies could drift apart (issue 167).
const LEGACY_INDEX_KEY = "zamak:video-index";

// Everything the watch page may do with storage.
const storageFrameHandlers = {
  getSession: storage.getSession.bind(storage),
  saveSession: storage.saveSession.bind(storage),
  setSyncedAt: storage.setSyncedAt.bind(storage),
  getIndexEntry: storage.getIndexEntry.bind(storage),
  listIndex: storage.listIndex.bind(storage),
  async importLegacy(source: string, data: LegacyData) {
    const extensionIndex =
      (await chromeStorage.get<VideoIndexEntry[]>(LEGACY_INDEX_KEY)) ?? [];
    await storage.importLegacy(source, {
      ...data,
      index: mergeLegacyIndexes(data.index, extensionIndex),
    });
  },
  isLegacyImported: storage.isLegacyImported.bind(storage),
};

export type StorageFrameHandlers = typeof storageFrameHandlers;

export type StorageFrameEvent = { notice: StorageNotice; own: boolean };

function main() {
  const rpc = serveFrameRpc<StorageFrameEvent>(storageFrameHandlers, {
    parentOrigin: YOUTUBE_ORIGIN,
  });
  storage.subscribe((notice, own) => rpc.emit({ notice, own }));
}

function mergeLegacyIndexes(a: VideoIndexEntry[], b: VideoIndexEntry[]) {
  const merged = new Map(a.map((e) => [e.youtubeId, e]));
  for (const entry of b) {
    const other = merged.get(entry.youtubeId);
    if (!other || compareEntries(entry, other) > 0) {
      merged.set(entry.youtubeId, entry);
    }
  }
  return [...merged.values()];
}

// Newer local change first, then the more recent sync.
function compareEntries(a: VideoIndexEntry, b: VideoIndexEntry) {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? 1 : -1;
  }
  return (a.syncedAt ?? "") > (b.syncedAt ?? "") ? 1 : -1;
}

main();
