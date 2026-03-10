// ISOLATED world content script — relays video index from localStorage to
// the extension's background service worker via chrome.runtime messaging.
// The MAIN world content script writes to localStorage and dispatches a
// plain Event as a signal; this script reads the data and forwards it.

const KEY = "zamak:video-index";

window.addEventListener("zamak:video-index-updated", () => {
  try {
    const raw = localStorage.getItem(KEY);
    const entries = raw ? JSON.parse(raw) : [];
    chrome.runtime.sendMessage({
      type: "video-index-updated",
      payload: entries,
    });
  } catch (e) {
    console.warn("[zamak relay]", e);
  }
});
