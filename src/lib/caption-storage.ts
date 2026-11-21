import { idbCaptionStorage } from "./caption-db.ts";
import type { MergeStrategy, MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import { type VideoIndexEntry, videoIndexStore } from "./video-index.ts";

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

export type StorageNotice = { type: "index"; entries: VideoIndexEntry[] };

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
  listIndex(): Promise<VideoIndexEntry[]>;
  subscribe(listener: StorageListener): () => void;
}

let current: CaptionStorage = idbCaptionStorage;
let unsubscribeIndex = subscribeIndex(current);

// The watch page swaps in the extension frame bridge. Every other context
// opens IndexedDB on its own origin.
export function setCaptionStorage(storage: CaptionStorage) {
  unsubscribeIndex();
  current = storage;
  unsubscribeIndex = subscribeIndex(storage);
}

function subscribeIndex(storage: CaptionStorage) {
  return storage.subscribe((notice) => {
    if (notice.type === "index") {
      videoIndexStore.set(notice.entries);
    }
  });
}

export async function loadVideoIndex() {
  videoIndexStore.set(await current.listIndex());
}

export const captionStorage: CaptionStorage = {
  getSession: (youtubeId) => current.getSession(youtubeId),
  saveSession: (session, options) => current.saveSession(session, options),
  deleteVideo: (youtubeId) => current.deleteVideo(youtubeId),
  setSyncedAt: (youtubeId, serverUpdatedAt) =>
    current.setSyncedAt(youtubeId, serverUpdatedAt),
  listIndex: () => current.listIndex(),
  subscribe: (listener) => current.subscribe(listener),
};
