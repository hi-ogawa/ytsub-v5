// ISOLATED world content script — BroadcastChannel RPC relay between MAIN world
// and background worker, plus store sync (localStorage → chrome.storage).

import { STORE_CHANNEL_NAME } from "../lib/external-store.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { connectContentPort } from "./lib/content-ports.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";

function main() {
  // Register with background so it can find this tab for reverse RPC
  connectContentPort();

  // Generic RPC relay — forwards all zamak:rpc events to background
  setupRpcRelay();

  // Reverse RPC relay — forwards background→tab calls to MAIN world
  setupTabRpcRelay();

  // Store sync: MAIN world store changes → chrome.storage
  const storeChannel = new BroadcastChannel(STORE_CHANNEL_NAME);
  storeChannel.addEventListener("message", (e) => {
    const { key, value } = e.data;
    if (key === VIDEO_INDEX_KEY) {
      chrome.storage.local.set({ [key]: value });
    }
  });
}

main();
