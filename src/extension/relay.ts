// ISOLATED world content script — relays video index from localStorage to
// the extension's background service worker via chrome.runtime messaging.
// The MAIN world content script writes to localStorage and dispatches a
// plain Event as a signal; this script reads the data and forwards it.

import type { ExtensionMessage } from "./messages.ts";
import { STORAGE_KEY } from "./messages.ts";

window.addEventListener(`zamak:store:${STORAGE_KEY}`, () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const msg: ExtensionMessage = {
      type: "video-index-updated",
      payload: entries,
    };
    chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});
