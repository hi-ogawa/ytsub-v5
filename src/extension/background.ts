// Background service worker — stores video index in chrome.storage.local
// so the bookmarks page can read it (cross-origin from youtube.com).

import type { ExtensionMessage } from "./messages.ts";

declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (cb: (msg: ExtensionMessage) => void) => void;
    };
  };
  action: {
    onClicked: {
      addListener: (cb: () => void) => void;
    };
  };
  storage: { local: { set: (items: Record<string, unknown>) => void } };
  tabs: { create: (opts: { url: string }) => void };
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "video-index-updated") {
    chrome.storage.local.set({ "video-index": msg.payload });
  }
});

// Open bookmarks page in a new tab when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "bookmarks.html" });
});
