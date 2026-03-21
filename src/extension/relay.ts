// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus localStorage → chrome.storage sync.

import { setupSyncedStoreRelay } from "../lib/synced-stores.ts";
import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";

function main() {
  setupRpcRelay();
  setupTabRpcRelay();
  setupSyncedStoreRelay();
}

main();
