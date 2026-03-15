// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus video-index localStorage → background sync.

import { storeEventName } from "../lib/external-store.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import type { bgRpcHandlers } from "./background.ts";
import {
  createRpc,
  setupRpcRelay,
  setupTabRpcRelay,
} from "./lib/extension-rpc.ts";

const bgRpc = createRpc<typeof bgRpcHandlers>({ direct: true });

function main() {
  // Generic RPC relay — forwards all zamak:rpc events to background
  setupRpcRelay();

  // Reverse RPC relay — forwards background→tab calls to MAIN world
  setupTabRpcRelay();

  // Video index: localStorage change → notify background to sync to chrome.storage
  window.addEventListener(storeEventName(VIDEO_INDEX_KEY), () => {
    try {
      const raw = localStorage.getItem(VIDEO_INDEX_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      bgRpc.videoIndexUpdated({ entries });
    } catch (e) {
      console.warn("[zamak relay]", e);
    }
  });
}

main();
