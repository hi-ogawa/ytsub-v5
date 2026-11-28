import { withUseValue } from "../components/use-store-value.ts";
import { createStore } from "../utils/store.ts";
import type { MergedCaption } from "./caption-merge.ts";
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
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
}

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  /**
   * When the content was last edited, on whichever device or server made the
   * edit. Push and pull copy it unchanged.
   */
  editedAt: string;
  /** editedAt at the last push or pull */
  syncedEditedAt?: string;
};

/**
 * Every saved session has a video index entry, but a video is listed only once it
 * has a bookmark or has been synced, so videos that were only watched stay
 * out of the list.
 */
export function isVideoListed(entry: VideoIndexEntry): boolean {
  return entry.bookmarkCount > 0 || entry.syncedEditedAt !== undefined;
}

export type StorageNotice = { type: "videoIndex"; entries: VideoIndexEntry[] };

export type StorageListener = (notice: StorageNotice) => void;

export interface CaptionStorage {
  getSession(youtubeId: string): Promise<PersistedCaptionSession | undefined>;
  /**
   * Also updates the video's index entry. `syncedEditedAt` marks the session
   * as the copy synced at that edit time, as after a pull, so it is recorded as
   * both the entry's edit time and its last sync.
   */
  saveSession(
    session: PersistedCaptionSession,
    options?: { syncedEditedAt?: string },
  ): Promise<void>;
  deleteVideo(youtubeId: string): Promise<void>;
  markSynced(options: { youtubeId: string; editedAt: string }): Promise<void>;
  getVideoIndexEntry(youtubeId: string): Promise<VideoIndexEntry | undefined>;
  listVideoIndex(): Promise<VideoIndexEntry[]>;
  subscribe(listener: StorageListener): () => void;
}

/**
 * In-memory copy of the listed entries in the stored video index, for components
 * that read it as they render.
 */
export const videoIndexStore = createVideoIndexStore();

function createVideoIndexStore() {
  const store = withUseValue(
    createStore<{ entries: VideoIndexEntry[] }>({ entries: [] }),
  );

  const connect = async (storage: CaptionStorage) => {
    // Subscribe before loading so a change made during the load isn't lost.
    storage.subscribe((notice) => {
      if (notice.type === "videoIndex") {
        store.update({ entries: notice.entries.filter(isVideoListed) });
      }
    });
    const entries = await storage.listVideoIndex();
    store.update({ entries: entries.filter(isVideoListed) });
  };

  return { ...store, connect };
}
