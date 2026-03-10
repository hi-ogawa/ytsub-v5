// Background service worker — stores video index in chrome.storage.local
// so the bookmarks page can read it (cross-origin from youtube.com).

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "video-index-updated") {
    chrome.storage.local.set({ "video-index": msg.payload });
  }
});

// Open bookmarks page in a new tab when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "bookmarks.html" });
});
