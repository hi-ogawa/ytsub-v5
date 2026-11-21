// Hidden extension frame on the watch page. It opens IndexedDB on the extension
// origin for the content script. docs/extension-runtime.md explains the bridge.

import { idbCaptionStorage } from "../lib/caption-db.ts";
import type { LegacyData } from "../lib/caption-storage.ts";
import type { VideoIndexEntry } from "../lib/video-index.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import {
  type BridgeMessage,
  type BridgeMethod,
  YOUTUBE_ORIGIN,
} from "./lib/storage-bridge.ts";

const storage = idbCaptionStorage;

// Before the move, the extension kept a second copy of the index in
// chrome.storage.local, and the two copies could drift apart (issue 167).
const LEGACY_INDEX_KEY = "zamak:video-index";

const handlers: Record<BridgeMethod, (...params: any[]) => Promise<unknown>> = {
  getSession: (youtubeId) => storage.getSession(youtubeId),
  saveSession: (session, options) => storage.saveSession(session, options),
  setSyncedAt: (youtubeId, serverUpdatedAt) =>
    storage.setSyncedAt(youtubeId, serverUpdatedAt),
  listIndex: () => storage.listIndex(),
  async importLegacy(source: string, data: LegacyData) {
    const extensionIndex =
      (await chromeStorage.get<VideoIndexEntry[]>(LEGACY_INDEX_KEY)) ?? [];
    await storage.importLegacy(source, {
      ...data,
      index: mergeLegacyIndexes(data.index, extensionIndex),
    });
  },
  isLegacyImported: (source) => storage.isLegacyImported(source),
};

function mergeLegacyIndexes(a: VideoIndexEntry[], b: VideoIndexEntry[]) {
  const merged = new Map(a.map((e) => [e.youtubeId, e]));
  for (const entry of b) {
    const other = merged.get(entry.youtubeId);
    if (!other || compareEntries(entry, other) > 0) {
      merged.set(entry.youtubeId, entry);
    }
  }
  return [...merged.values()];
}

// Newer local change first, then the more recent sync.
function compareEntries(a: VideoIndexEntry, b: VideoIndexEntry) {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? 1 : -1;
  }
  return (a.syncedAt ?? "") > (b.syncedAt ?? "") ? 1 : -1;
}

function postToPage(message: BridgeMessage) {
  window.parent.postMessage(message, YOUTUBE_ORIGIN);
}

window.addEventListener("message", async (e) => {
  if (e.source !== window.parent || e.origin !== YOUTUBE_ORIGIN) {
    return;
  }
  const message = e.data as BridgeMessage;
  if (message?.type === "zamak-storage:hello") {
    postToPage({ type: "zamak-storage:ready" });
    return;
  }
  if (message?.type !== "zamak-storage:request") {
    return;
  }
  const { id, method, params } = message;
  const handler = Object.hasOwn(handlers, method)
    ? handlers[method]
    : undefined;
  try {
    if (!handler) {
      throw new Error(`Unknown storage method: ${method}`);
    }
    const result = await handler(...params);
    postToPage({ type: "zamak-storage:response", id, result });
  } catch (err) {
    console.error(`[zamak storage-frame] ${method}:`, err);
    postToPage({
      type: "zamak-storage:response",
      id,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

storage.subscribe((notice) => {
  postToPage({ type: "zamak-storage:notice", notice });
});

postToPage({ type: "zamak-storage:ready" });
