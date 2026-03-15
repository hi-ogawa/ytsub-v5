// Background service worker — stores video index in chrome.storage.local
// so the bookmarks page can read it (cross-origin from youtube.com).

import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";

export type VideoIndexMessage = {
  type: "video-index-updated";
  payload: VideoIndexEntry[];
};

chrome.runtime.onMessage.addListener((msg) => {
  const parsed = msg as VideoIndexMessage;
  if (parsed.type === "video-index-updated") {
    chrome.storage.local.set({ [VIDEO_INDEX_KEY]: parsed.payload });
  }
});

// Open bookmarks page in a new tab when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "bookmarks.html" });
});
