// Background service worker — handles RPC from content script (via relay).

import { sessionToExportData } from "../lib/caption-session.ts";
import { serverSessionToLocal } from "../lib/sync.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import type { tabRpcHandlers } from "./content.tsx";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { createContentPortTracker } from "./lib/content-ports.ts";
import { createExtPortTracker } from "./lib/ext-ports.ts";
import { createContentRpc, registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

const contentTabs = createContentPortTracker();
export const extPages = createExtPortTracker();
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

  // Cross-origin store sync: route updates between content tabs and ext pages.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type !== "zamak-store-update") return;
    const { key, value } = msg;
    const isFromContentTab = sender.tab?.id !== undefined;
    if (isFromContentTab) {
      // Content → ext pages
      extPages.broadcast({ type: "zamak-store-update", key, value });
    } else {
      // Ext page → content tab
      const tabId = contentTabs.findTabOrUndefined();
      if (tabId !== undefined) {
        chrome.tabs.sendMessage(tabId, {
          type: "zamak-store-update",
          key,
          value,
        });
      }
    }
  });

  // Open bookmarks page in a new tab when extension icon is clicked.
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "bookmarks.html" });
  });
}

main();
