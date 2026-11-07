// ISOLATED world content script — BroadcastChannel RPC relay between MAIN world
// and background worker, plus store sync (localStorage ↔ chrome.storage).

import { type VideoIndexEntry, videoIndexStore } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { connectContentPort } from "./lib/content-ports.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";

async function main() {
  // Boot hydration: chrome.storage → store (writes to shared localStorage
  // so MAIN world's store picks up fresh data on init)
  const entries = await chromeStorage.get<VideoIndexEntry[]>(
    videoIndexStore.key,
  );
  videoIndexStore.setLocal(entries ?? []);

  // Persist MAIN world store changes to chrome.storage.
  // MAIN writes → BC delivers to relay's store → subscribe fires → chrome.storage
  videoIndexStore.subscribe(() => {
    chromeStorage.set({ [videoIndexStore.key]: videoIndexStore.get() });
  });

  // Register with background so it can find this tab for reverse RPC
  connectContentPort();

  // Generic RPC relay — forwards all zamak:rpc events to background
  setupRpcRelay();

  // Reverse RPC relay — forwards background→tab calls to MAIN world
  setupTabRpcRelay();
}

main();
