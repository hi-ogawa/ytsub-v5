// ISOLATED world content script. docs/extension-runtime.md explains its role.

import { setupRpcRelay } from "./lib/extension-rpc.ts";
import { STORAGE_FRAME_ID, STORAGE_FRAME_PATH } from "./lib/storage-bridge.ts";

function main() {
  mountStorageFrame();
  setupRpcRelay();
}

/**
 * The frame is mounted here because only this world has chrome.runtime to
 * build its extension URL. The worlds share the DOM, so the main world finds
 * the frame by id and posts to it directly; this script takes no part in
 * storage calls after mounting.
 */
function mountStorageFrame() {
  const frame = document.createElement("iframe");
  frame.id = STORAGE_FRAME_ID;
  frame.src = chrome.runtime.getURL(STORAGE_FRAME_PATH);
  frame.style.display = "none";
  document.documentElement.appendChild(frame);
}

main();
