// Background service worker — handles RPC from content script (via relay)
// and stores video index in chrome.storage.local.

import { sessionToExportData } from "../lib/caption-session.ts";
import { serverSessionToLocal } from "../lib/sync.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { registerRpcHandlers, sendTabRpc } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

async function findYouTubeTab(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) throw new Error("No YouTube tab open");
  return tabId;
}

export const bgRpcHandlers = {
  async getSyncState({ youtubeId }: { youtubeId: string }) {
    const { authenticated } = await orpc.auth.check.call({});
    if (!authenticated) return { authenticated: false as const };
    const data = await orpc.videos.getVideoUpdatedAt.call({ youtubeId });
    return {
      authenticated: true as const,
      serverUpdatedAt: data?.updatedAt,
    };
  },

  async openBookmarks() {
    chrome.tabs.create({ url: "bookmarks.html" });
  },

  async pushSession({ youtubeId }: { youtubeId: string }) {
    const tabId = await findYouTubeTab();
    const session = await sendTabRpc(tabId, "getSession", { youtubeId });
    if (!session) throw new Error("No local session found");
    const exportData = sessionToExportData(
      session as Parameters<typeof sessionToExportData>[0],
    );
    await orpc.videos.importVideo.call(exportData);
  },

  async pullSession({ youtubeId }: { youtubeId: string }) {
    const tabId = await findYouTubeTab();
    const data = await orpc.videos.getFullSession.call({ youtubeId });
    if (!data) throw new Error("Video not found on server");
    const session = serverSessionToLocal(data);
    await sendTabRpc(tabId, "saveSession", { session });
    return {
      title: session.title,
      channelName: session.channelName,
      bookmarkCount: session.bookmarks.length,
    };
  },
};

async function main() {
  setRpcConfig({
    url: async () => new URL("/api", await getServerUrl()),
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

  registerRpcHandlers(bgRpcHandlers);

  // Open bookmarks page in a new tab when extension icon is clicked.
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "bookmarks.html" });
  });
}

main();
