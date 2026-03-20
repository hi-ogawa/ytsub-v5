// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus localStorage → chrome.storage sync.

import { setupSyncRelay } from "../lib/synced-stores.ts";
import type { bgRpcHandlers } from "./background.ts";
import {
  createRpc,
  setupRpcRelay,
  setupTabRpcRelay,
} from "./lib/extension-rpc.ts";

const bgRpc = createRpc<typeof bgRpcHandlers>({ direct: true });

function main() {
  setupRpcRelay();
  setupTabRpcRelay();
  setupSyncRelay((key, value) => bgRpc.syncedStoreUpdated({ key, value }));
}

main();
