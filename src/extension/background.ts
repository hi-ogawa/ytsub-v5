// Background service worker — handles RPC from content script (via relay)
// and stores video index in chrome.storage.local.

import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

function main() {
  setRpcConfig({
    url: getServerUrl() + "/api",
    fetch: async (request) => {
      const token = await chromeStorage.get<string>("session-token");
      if (token) {
        const headers = new Headers(
          request instanceof Request ? request.headers : undefined,
        );
        headers.set("authorization", `Bearer ${token}`);
        request = new Request(request, { headers });
      }
      return fetch(request);
    },
  });

  registerRpcHandlers({
    async getSyncState({ youtubeId }) {
      const { authenticated } = await orpc.auth.check.call({});
      if (!authenticated) return { authenticated: false };
      const data = await orpc.videos.getVideoUpdatedAt.call({ youtubeId });
      return {
        authenticated: true,
        serverUpdatedAt: data?.updatedAt,
      };
    },

    async openBookmarks() {
      chrome.tabs.create({ url: "bookmarks.html" });
    },

    async videoIndexUpdated({ entries }) {
      chrome.storage.local.set({ [VIDEO_INDEX_KEY]: entries });
    },
  });

  // Open bookmarks page in a new tab when extension icon is clicked.
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "bookmarks.html" });
  });
}

main();
