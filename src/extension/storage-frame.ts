// Hidden extension frame on the watch page. It opens IndexedDB on the extension
// origin for the content script. docs/extension-runtime.md explains the bridge.

import { idbCaptionStorage } from "../lib/caption-storage-idb.ts";
import {
  type BridgeMessage,
  type BridgeMethod,
  YOUTUBE_ORIGIN,
} from "./lib/storage-bridge.ts";

const storage = idbCaptionStorage;

const handlers: Record<BridgeMethod, (...params: any[]) => Promise<unknown>> = {
  getSession: (youtubeId) => storage.getSession(youtubeId),
  saveSession: (session, options) => storage.saveSession(session, options),
  setSyncedAt: (youtubeId, serverUpdatedAt) =>
    storage.setSyncedAt(youtubeId, serverUpdatedAt),
  listIndex: () => storage.listIndex(),
};

function main() {
  window.addEventListener("message", onMessage);
  storage.subscribe((notice) => {
    postToPage({ type: "zamak-storage:notice", notice });
  });
  postToPage({ type: "zamak-storage:ready" });
}

async function onMessage(e: MessageEvent) {
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
}

function postToPage(message: BridgeMessage) {
  window.parent.postMessage(message, YOUTUBE_ORIGIN);
}

main();
