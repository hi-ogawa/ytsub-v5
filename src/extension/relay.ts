// ISOLATED world content script — relays messages between the MAIN world
// content script and the extension's background service worker.
//
// MAIN world → localStorage event → relay → chrome.runtime.sendMessage → background
// background → response → relay → localStorage + event → MAIN world

import { storeEventName } from "../lib/external-store.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import type {
  ExtensionMessage,
  GetSyncStateResponse,
  VideoIndexMessage,
} from "./background.ts";

// Forward video index updates to background
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

const SYNC_STATE_KEY = "zamak:sync-state-response";
const SYNC_STATE_EVENT = "zamak:sync-state-result";

// Request sync state from background, write response to localStorage
window.addEventListener("zamak:get-sync-state", async (e) => {
  try {
    const youtubeId = (e as CustomEvent).detail;
    const msg: ExtensionMessage = { type: "get-sync-state", youtubeId };
    const response: GetSyncStateResponse =
      await chrome.runtime.sendMessage(msg);
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(response));
    window.dispatchEvent(new Event(SYNC_STATE_EVENT));
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});

// Open bookmarks page via background
window.addEventListener("zamak:open-bookmarks", () => {
  try {
    const msg: ExtensionMessage = { type: "open-bookmarks" };
    chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});
