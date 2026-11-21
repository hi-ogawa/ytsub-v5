// ISOLATED world content script. docs/extension-runtime.md explains its role.

import { setupRpcRelay, setupTabRpcRelay } from "./lib/extension-rpc.ts";
import { mirrorVideoIndex } from "./lib/video-index-mirror.ts";

async function main() {
  await mirrorVideoIndex();

  setupRpcRelay();

  setupTabRpcRelay();
}

main();
