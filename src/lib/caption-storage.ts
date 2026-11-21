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

export type StorageNotice =
  | { type: "index"; entries: VideoIndexEntry[] }
  | { type: "session-saved"; youtubeId: string };

// `own` is true for a write made through this same storage instance.
export type StorageListener = (notice: StorageNotice, own: boolean) => void;

export type LegacyData = {
  index: VideoIndexEntry[];
  sessions: PersistedCaptionSession[];
};

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
  getIndexEntry(youtubeId: string): Promise<VideoIndexEntry | undefined>;
  listIndex(): Promise<VideoIndexEntry[]>;
  // Runs once per source. docs/data-and-sync.md explains the conflict rule.
  importLegacy(source: string, data: LegacyData): Promise<void>;
  isLegacyImported(source: string): Promise<boolean>;
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
    if (notice.type === "index") {
      videoIndexStore.set(notice.entries);
    }
  });
}

export async function loadVideoIndex() {
  videoIndexStore.set(await captionStorage.listIndex());
}
