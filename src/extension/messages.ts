import type { VideoIndexEntry } from "../lib/video-index.ts";

export type ExtensionMessage = {
  type: "video-index-updated";
  payload: VideoIndexEntry[];
};

export const STORAGE_KEY = "zamak:video-index";
