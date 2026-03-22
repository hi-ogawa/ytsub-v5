// Background service worker — handles RPC from content script (via relay)
// and stores video index in chrome.storage.local.

import { sessionToExportData } from "../lib/caption-session.ts";
import { serverSessionToLocal } from "../lib/sync.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import type { tabRpcHandlers } from "./content.tsx";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { createContentPortTracker } from "./lib/content-ports.ts";
import { createContentRpc, registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

const contentTabs = createContentPortTracker();
const toRpc = createContentRpc<typeof tabRpcHandlers>;

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

  async openDownload() {
    chrome.tabs.create({ url: "download.html" });
  },

  async setDownloadData({ data }: { data: unknown }) {
    await chrome.storage.local.set({ "download-data": data });
  },

  async videoIndexUpdated({ entries }: { entries: VideoIndexEntry[] }) {
    chrome.storage.local.set({ [VIDEO_INDEX_KEY]: entries });
  },

  async pushSession({ youtubeId }: { youtubeId: string }) {
    const tabId = contentTabs.findTab();
    const session = await toRpc(tabId).getSession({ youtubeId });
    if (!session) throw new Error("No local session found");
    const exportData = sessionToExportData(
      session as Parameters<typeof sessionToExportData>[0],
    );
    await orpc.videos.importVideo.call(exportData);
  },

  async pullSession({ youtubeId }: { youtubeId: string }) {
    const tabId = contentTabs.findTab();
    const data = await orpc.videos.getFullSession.call({ youtubeId });
    if (!data) throw new Error("Video not found on server");
    const session = serverSessionToLocal(data);
    await toRpc(tabId).saveSession({ session });
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
