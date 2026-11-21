import { createExternalStore } from "./external-store.ts";

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  // Local clock, compared with updatedAt
  syncedAt?: string;
  // Server clock, the server's updatedAt at the last push or pull
  syncedServerUpdatedAt?: string;
};

// In-memory copy of the stored index, kept current by caption-storage.ts.
export const videoIndexStore = createExternalStore<VideoIndexEntry[]>([]);
