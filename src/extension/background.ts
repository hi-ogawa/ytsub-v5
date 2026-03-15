// Background service worker — stores video index in chrome.storage.local
// so the bookmarks page can read it (cross-origin from youtube.com).
// Also handles sync state queries and bookmarks page navigation for the
// content script (which can't access chrome APIs directly).

import type { VideoIndexEntry } from "../lib/video-index.ts";
import { VIDEO_INDEX_KEY } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import { getServerUrl } from "./lib/server-url.ts";

export type VideoIndexMessage = {
  type: "video-index-updated";
  payload: VideoIndexEntry[];
};

export type GetSyncStateMessage = {
  type: "get-sync-state";
  youtubeId: string;
};

export type GetSyncStateResponse = {
  authenticated: boolean;
  serverUpdatedAt?: string;
};

export type OpenBookmarksMessage = {
  type: "open-bookmarks";
};

export type ExtensionMessage =
  | VideoIndexMessage
  | GetSyncStateMessage
  | OpenBookmarksMessage;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const parsed = msg as ExtensionMessage;

  switch (parsed.type) {
    case "video-index-updated":
      chrome.storage.local.set({ [VIDEO_INDEX_KEY]: parsed.payload });
      break;

    case "get-sync-state":
      handleGetSyncState(parsed.youtubeId).then(sendResponse);
      return true; // keep channel open for async response

    case "open-bookmarks":
      chrome.tabs.create({ url: "bookmarks.html" });
      break;
  }
});

async function handleGetSyncState(
  youtubeId: string,
): Promise<GetSyncStateResponse> {
  const token = await chromeStorage.get<string>("session-token");
  if (!token) return { authenticated: false };

  try {
    const res = await fetch(`${getServerUrl()}/api/videos.getVideoUpdatedAt`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: { youtubeId } }),
    });
    if (!res.ok) return { authenticated: true };
    const data: { json?: { updatedAt?: string } } = await res.json();
    return {
      authenticated: true,
      serverUpdatedAt: data?.json?.updatedAt,
    };
  } catch {
    return { authenticated: true };
  }
}

// Open bookmarks page in a new tab when extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "bookmarks.html" });
});
