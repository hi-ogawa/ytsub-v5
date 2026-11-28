// Hidden extension frame on the watch page. It opens IndexedDB on the extension
// origin for the content script. docs/extension-runtime.md explains the bridge.

import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import type { StorageNotice } from "../lib/caption-storage.ts";
import { serveFrameRpc } from "./lib/frame-rpc.ts";
import { YOUTUBE_ORIGIN } from "./lib/storage-bridge.ts";

const storage = idbCaptionStorage;

// Everything the watch page may do with storage.
const storageFrameHandlers = {
  getSession: storage.getSession.bind(storage),
  saveSession: storage.saveSession.bind(storage),
  addToIndex: storage.addToIndex.bind(storage),
  markSynced: storage.markSynced.bind(storage),
  getVideoIndexEntry: storage.getVideoIndexEntry.bind(storage),
  listVideoIndex: storage.listVideoIndex.bind(storage),
};

export type StorageFrameHandlers = typeof storageFrameHandlers;

function main() {
  const rpc = serveFrameRpc<StorageNotice>(storageFrameHandlers, {
    parentOrigin: YOUTUBE_ORIGIN,
  });
  storage.subscribe((notice) => rpc.emit(notice));
}

main();
