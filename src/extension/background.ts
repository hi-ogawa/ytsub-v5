// Background service worker. docs/extension-runtime.md explains its role.

import { sessionToExportData } from "../lib/caption-session.ts";
import { serverSessionToLocal } from "../lib/caption-session.ts";
import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import { orpc, setRpcConfig } from "../lib/rpc-client.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { registerRpcHandlers } from "./lib/extension-rpc.ts";
import { getServerUrl } from "./lib/server-url.ts";

export const backgroundRpcHandlers = {
  async getSyncState({ youtubeId }: { youtubeId: string }) {
    const { authenticated } = await orpc.auth.check.call({});
    if (!authenticated) {
      return { authenticated: false as const };
    }
    const data = await orpc.videos.getVideoEditedAt.call({ youtubeId });
    return {
      authenticated: true as const,
      serverEditedAt: data?.editedAt,
    };
  },

  async openBookmarks() {
    chrome.tabs.create({ url: "bookmarks.html" });
  },

  // The caption panel pushes with this, because the session token stays here.
  async pushSession({ youtubeId }: { youtubeId: string }) {
    const session = await idbCaptionStorage.getSession(youtubeId);
    if (!session) {
      throw new Error("No local session found");
    }
    const entry = await idbCaptionStorage.getVideoIndexEntry(youtubeId);
    if (!entry) {
      throw new Error("No local index entry found");
    }
    const result = await orpc.videos.importVideo.call(
      sessionToExportData(session, { editedAt: entry.editedAt }),
    );
    return { editedAt: result.editedAt };
  },

  // The caption panel pulls with this. docs/extension-runtime.md explains why.
  async fetchSession({ youtubeId }: { youtubeId: string }) {
    const data = await orpc.videos.getFullSession.call({ youtubeId });
    if (!data) {
      throw new Error("Video not found on server");
    }
    return {
      session: serverSessionToLocal(data),
      editedAt: data.video.editedAt,
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

  registerRpcHandlers(backgroundRpcHandlers);

  // Open bookmarks page in a new tab when extension icon is clicked.
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "bookmarks.html" });
  });
}

main();
