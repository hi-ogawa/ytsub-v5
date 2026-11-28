// The watch page reaches extension-origin storage through a hidden extension
// frame. docs/extension-runtime.md explains the bridge.

import type {
  CaptionStorage,
  StorageNotice,
} from "../../lib/caption-storage.ts";
import { connectFrameRpc } from "./frame-rpc.ts";

export const STORAGE_FRAME_ID = "zamak-storage-frame";
export const STORAGE_FRAME_PATH = "storage-frame.html";
export const YOUTUBE_ORIGIN = "https://www.youtube.com";

export function createBridgeStorage(): CaptionStorage {
  return connectFrameRpc<Omit<CaptionStorage, "subscribe">, StorageNotice>({
    frameId: STORAGE_FRAME_ID,
    timeoutMs: 30_000,
    timeoutMessage: "Zamak lost its connection to storage. Reload the page.",
  });
}
