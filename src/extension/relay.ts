// ISOLATED world content script — generic RPC relay between MAIN world
// and background worker, plus video-index localStorage → background sync.

import { storeEventName } from "../lib/external-store.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { type RpcRequest, setupRpcRelay } from "./lib/extension-rpc.ts";

// Generic RPC relay — forwards all zamak:rpc events to background
setupRpcRelay();

// Video index: localStorage change → fire-and-forget RPC to background
window.addEventListener(storeEventName(VIDEO_INDEX_KEY), () => {
  try {
    const raw = localStorage.getItem(VIDEO_INDEX_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const msg: RpcRequest = {
      type: "zamak-rpc",
      id: "",
      method: "videoIndexUpdated",
      params: { entries },
    };
    chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});
