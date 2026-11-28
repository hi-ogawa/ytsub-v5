// The watch page reaches extension-origin storage through a hidden extension
// frame. docs/extension-runtime.md explains the bridge.

import {
  CaptionStorage,
  type StorageNotice,
} from "../../lib/caption-storage.ts";
import type { StorageFrameHandlers } from "../storage-frame.ts";
import { connectFrameRpc } from "./frame-rpc.ts";

export const STORAGE_FRAME_ID = "zamak-storage-frame";
export const STORAGE_FRAME_PATH = "storage-frame.html";
export const YOUTUBE_ORIGIN = "https://www.youtube.com";

export function createBridgeStorage(): CaptionStorage {
  return new BridgeCaptionStorage();
}

class BridgeCaptionStorage extends CaptionStorage {
  private readonly rpc = connectFrameRpc<StorageFrameHandlers, StorageNotice>({
    frameId: STORAGE_FRAME_ID,
    timeoutMs: 30_000,
    timeoutMessage: "Zamak lost its connection to storage. Reload the page.",
  });

  getSession: CaptionStorage["getSession"] = this.rpc.client.getSession;
  saveSession: CaptionStorage["saveSession"] = this.rpc.client.saveSession;
  markSynced: CaptionStorage["markSynced"] = this.rpc.client.markSynced;
  getVideoIndexEntry: CaptionStorage["getVideoIndexEntry"] =
    this.rpc.client.getVideoIndexEntry;
  listVideoIndex: CaptionStorage["listVideoIndex"] =
    this.rpc.client.listVideoIndex;
  subscribe: CaptionStorage["subscribe"] = this.rpc.onEvent;

  deleteVideo: CaptionStorage["deleteVideo"] = async () => {
    throw new Error("Deleting is not available on the watch page");
  };
}
