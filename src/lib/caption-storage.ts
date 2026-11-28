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

export type StorageNotice = { type: "videoIndex"; entries: VideoIndexEntry[] };

export type StorageListener = (notice: StorageNotice) => void;

export interface CaptionStorage {
  getSession(youtubeId: string): Promise<PersistedCaptionSession | undefined>;
  /**
   * Also updates the video's index entry when the session has bookmarks,
   * already has an entry, is saved as synced, or is saved with
   * `addToVideoIndex`. `syncedEditedAt` marks the session as the copy synced at
   * that edit time, as after a pull, so it is recorded as both the entry's edit
   * time and its last sync.
   */
  saveSession(
    session: PersistedCaptionSession,
    options?: { syncedEditedAt?: string; addToVideoIndex?: boolean },
  ): Promise<void>;
  deleteVideo(youtubeId: string): Promise<void>;
  markSynced(options: { youtubeId: string; editedAt: string }): Promise<void>;
  getVideoIndexEntry(youtubeId: string): Promise<VideoIndexEntry | undefined>;
  listVideoIndex(): Promise<VideoIndexEntry[]>;
  subscribe(listener: StorageListener): () => void;
}

/**
 * Give a video without bookmarks a video index entry before a push. An
 * existing entry is left alone, because a push copies its edit time unchanged.
 */
export async function ensureVideoIndexEntry({
  storage,
  youtubeId,
}: {
  storage: CaptionStorage;
  youtubeId: string;
}): Promise<void> {
  if (await storage.getVideoIndexEntry(youtubeId)) {
    return;
  }
  const session = await storage.getSession(youtubeId);
  if (!session) {
    throw new Error("No local session found");
  }
  await storage.saveSession(session, { addToVideoIndex: true });
}

/**
 * In-memory copy of the stored index, for components that read it as they
 * render.
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
        store.update({ entries: notice.entries });
      }
    });
    store.update({ entries: await storage.listVideoIndex() });
  };

  return { ...store, connect };
}
