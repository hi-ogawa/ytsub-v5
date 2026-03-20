// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus localStorage → chrome.storage sync for all
// registered synced stores.

import { SYNCED_STORES } from "../lib/synced-stores.ts";
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

  // Synced stores: localStorage change → notify background to sync to chrome.storage
  for (const { key, eventName } of SYNCED_STORES) {
    window.addEventListener(eventName, () => {
      try {
        const raw = localStorage.getItem(key);
        const value = raw ? JSON.parse(raw) : undefined;
        bgRpc.syncedStoreUpdated({ key, value });
      } catch (e) {
        console.warn("[zamak relay]", e);
      }
    });
  }
}

main();
