import { withUseValue } from "../components/use-store-value.ts";
import { createStore } from "../utils/store.ts";
import type { MergeStrategy, MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";

export interface PersistedCaptionSession {
  youtubeId: string;
  title: string;
  channelName: string;
  channelId: string;
  duration: number;
  vssId1: string;
  vssId2: string;
  language1: string;
  language2: string;
  strategy?: MergeStrategy;
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
}

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

export type StorageNotice = { type: "videoIndex"; entries: VideoIndexEntry[] };

export type StorageListener = (notice: StorageNotice) => void;

export interface CaptionStorage {
  getSession(youtubeId: string): Promise<PersistedCaptionSession | undefined>;
  // Also updates the video's index entry when the session has bookmarks or is
  // already indexed. `forceIndex` indexes it regardless, as after a pull.
  saveSession(
    session: PersistedCaptionSession,
    options?: { forceIndex?: boolean },
  ): Promise<void>;
  deleteVideo(youtubeId: string): Promise<void>;
  setSyncedAt(youtubeId: string, serverUpdatedAt: string): Promise<void>;
  getVideoIndexEntry(youtubeId: string): Promise<VideoIndexEntry | undefined>;
  listVideoIndex(): Promise<VideoIndexEntry[]>;
  subscribe(listener: StorageListener): () => void;
}

// In-memory copy of the stored index, for components that read it as they
// render.
export const videoIndexStore = withUseValue(
  createStore<{ entries: VideoIndexEntry[] }>({ entries: [] }),
);

export function updateVideoIndexStore(notice: StorageNotice) {
  if (notice.type === "videoIndex") {
    videoIndexStore.update({ entries: notice.entries });
  }
}

export async function loadVideoIndex(storage: CaptionStorage) {
  videoIndexStore.update({ entries: await storage.listVideoIndex() });
}
