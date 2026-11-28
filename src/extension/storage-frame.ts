// Hidden extension frame on the watch page. It opens IndexedDB on the extension
// origin for the content script. docs/extension-runtime.md explains the bridge.

import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import type { StorageNotice } from "../lib/caption-storage.ts";
import { serveFrameRpc } from "./lib/frame-rpc.ts";
import { YOUTUBE_ORIGIN } from "./lib/storage-bridge.ts";

function main() {
  const rpc = serveFrameRpc<StorageNotice>(idbCaptionStorage, {
    parentOrigin: YOUTUBE_ORIGIN,
  });
  idbCaptionStorage.subscribe((notice) => rpc.emit(notice));
}

main();
