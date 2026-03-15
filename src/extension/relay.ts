// ISOLATED world content script — relays video index from localStorage to
// the extension's background service worker via chrome.runtime messaging.
// The MAIN world content script writes to localStorage and dispatches a
// plain Event as a signal; this script reads the data and forwards it.

import { storeEventName } from "../lib/external-store.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import type { VideoIndexMessage } from "./background.ts";

window.addEventListener(storeEventName(VIDEO_INDEX_KEY), () => {
  try {
    const raw = localStorage.getItem(VIDEO_INDEX_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const msg: VideoIndexMessage = {
      type: "video-index-updated",
      payload: entries,
    };
    chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});
