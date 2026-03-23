// ISOLATED world content script — BroadcastChannel RPC relay between MAIN world
// and background worker, plus store sync (localStorage ↔ chrome.storage).

import { type VideoIndexEntry, videoIndexStore } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { connectContentPort } from "./lib/content-ports.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storesByKey = new Map<string, { setBroadcast(value: any): void }>([
  [videoIndexStore.key, videoIndexStore],
]);

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

  // Cross-origin store sync: send local changes to BG, receive from ext pages via BG
  videoIndexStore.onSet = (key, value) => {
    chrome.runtime.sendMessage({ type: "zamak-store-update", key, value });
  };
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "zamak-store-update") return;
    const store = storesByKey.get(msg.key);
    store?.setBroadcast(msg.value);
  });

  // Register with background so it can find this tab for reverse RPC
  connectContentPort();

  // Generic RPC relay — forwards all zamak:rpc events to background
  setupRpcRelay();

  // Reverse RPC relay — forwards background→tab calls to MAIN world
  setupTabRpcRelay();
}

main();
