// Background service worker. docs/extension-runtime.md explains its role.

import { sessionToExportData } from "../lib/caption-session.ts";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import { captionStorage, initCaptionStorage } from "../lib/caption-storage.ts";
import { serverSessionToLocal } from "../lib/sync.ts";
import { orpc, setRpcConfig } from "../rpc.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

export const bgRpcHandlers = {
  async getSyncState({ youtubeId }: { youtubeId: string }) {
    const { authenticated } = await orpc.auth.check.call({});
    if (!authenticated) {
      return { authenticated: false as const };
    }
    const data = await orpc.videos.getVideoUpdatedAt.call({ youtubeId });
    return {
      authenticated: true as const,
      serverUpdatedAt: data?.updatedAt,
    };
  },

  async openBookmarks() {
    chrome.tabs.create({ url: "bookmarks.html" });
  },

  // The caption panel pushes with this, because the session token stays here.
  async pushSession({ youtubeId }: { youtubeId: string }) {
    const session = await captionStorage.getSession(youtubeId);
    if (!session) {
      throw new Error("No local session found");
    }
    const result = await orpc.videos.importVideo.call(
      sessionToExportData(session),
    );
    return { serverUpdatedAt: result.updatedAt };
  },

  // The caption panel pulls with this. docs/extension-runtime.md explains why.
  async fetchSession({ youtubeId }: { youtubeId: string }) {
    const data = await orpc.videos.getFullSession.call({ youtubeId });
    if (!data) {
      throw new Error("Video not found on server");
    }
    return {
      session: serverSessionToLocal(data),
      serverUpdatedAt: data.video.updatedAt,
    };
  },
};

async function main() {
  initCaptionStorage(idbCaptionStorage);
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
