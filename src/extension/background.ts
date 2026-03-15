// Background service worker — handles RPC from content script (via relay)
// and stores video index in chrome.storage.local.

import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { type RpcHandlers, registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

const handlers: RpcHandlers = {
  async getSyncState({ youtubeId }) {
    const token = await chromeStorage.get<string>("session-token");
    if (!token) return { authenticated: false };

    try {
      const res = await fetch(
        `${getServerUrl()}/api/videos.getVideoUpdatedAt`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ json: { youtubeId } }),
        },
      );
      if (!res.ok) return { authenticated: true };
      const data: { json?: { updatedAt?: string } } = await res.json();
      return {
        authenticated: true,
        serverUpdatedAt: data?.json?.updatedAt,
      };
    } catch {
      return { authenticated: true };
    }
  },

  async openBookmarks() {
    chrome.tabs.create({ url: "bookmarks.html" });
  },

  async videoIndexUpdated({ entries }) {
    chrome.storage.local.set({ [VIDEO_INDEX_KEY]: entries });
  },
};

registerRpcHandlers(handlers);

// Open bookmarks page in a new tab when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "bookmarks.html" });
});
