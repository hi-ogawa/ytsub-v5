// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus localStorage → chrome.storage sync for all
// registered synced stores.

import { STORE_UPDATED_EVENT } from "../lib/external-store.ts";
import { SYNCED_STORES } from "../lib/synced-stores.ts";
import type { bgRpcHandlers } from "./background.ts";
import {
  createRpc,
  setupRpcRelay,
  setupTabRpcRelay,
} from "./lib/extension-rpc.ts";

const bgRpc = createRpc<typeof bgRpcHandlers>({ direct: true });

const syncedKeys = new Set(SYNCED_STORES.map((s) => s.key));

function main() {
  setupRpcRelay();
  setupTabRpcRelay();

  // Synced stores: localStorage change → notify background to sync to chrome.storage
  window.addEventListener(STORE_UPDATED_EVENT, (e) => {
    const key = (e as CustomEvent<string>).detail;
    if (!syncedKeys.has(key)) return;
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : undefined;
      bgRpc.syncedStoreUpdated({ key, value });
    } catch (err) {
      console.warn("[zamak relay]", err);
    }
  });
}

main();
