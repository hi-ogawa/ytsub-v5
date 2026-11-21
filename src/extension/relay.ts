// ISOLATED world content script. docs/extension-runtime.md explains its role.

import { setupRpcRelay } from "./lib/extension-rpc.ts";
import { STORAGE_FRAME_ID, STORAGE_FRAME_PATH } from "./lib/storage-bridge.ts";

function main() {
  mountStorageFrame();
  setupRpcRelay();
}

// The main world has no chrome.runtime to build the frame URL.
function mountStorageFrame() {
  const frame = document.createElement("iframe");
  frame.id = STORAGE_FRAME_ID;
  frame.src = chrome.runtime.getURL(STORAGE_FRAME_PATH);
  frame.style.display = "none";
  document.documentElement.appendChild(frame);
}

main();
