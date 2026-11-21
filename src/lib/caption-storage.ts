import type { MergeStrategy, MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import { createExternalStore } from "./external-store.ts";

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

// Each entry point calls initCaptionStorage once at startup: the watch page
// with the extension frame bridge, every other context with IndexedDB on its
// own origin.
export let captionStorage: CaptionStorage;

// In-memory copy of the stored index, for components that read it as they
// render.
export const videoIndexStore = createExternalStore<VideoIndexEntry[]>([]);

export function initCaptionStorage(storage: CaptionStorage) {
  captionStorage = storage;
  storage.subscribe((notice) => {
    if (notice.type === "videoIndex") {
      videoIndexStore.set(notice.entries);
    }
  });
}

export async function loadVideoIndex() {
  videoIndexStore.set(await captionStorage.listVideoIndex());
}
