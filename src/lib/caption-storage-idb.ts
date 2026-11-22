import { createTransact } from "../utils/idb.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
  StorageListener,
  StorageNotice,
  VideoIndexEntry,
} from "./caption-storage.ts";

const DB_NAME = "zamak";
const DB_VERSION = 3;

type Stores = { sessions: PersistedCaptionSession; videos: VideoIndexEntry };

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  videos: "videos",
};

// A video index entry as stored before version 3
type VideoIndexEntryV2 = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncedAt?: string;
  syncedServerUpdatedAt?: string;
};

const transact = createTransact<Stores>({
  name: DB_NAME,
  version: DB_VERSION,
  storeNames: STORE_NAMES,
  upgrade(db, oldVersion, tx) {
    if (oldVersion < 1) {
      db.createObjectStore(STORE_NAMES.sessions, { keyPath: "youtubeId" });
    }
    if (oldVersion < 2) {
      db.createObjectStore(STORE_NAMES.videos, { keyPath: "youtubeId" });
    }
    if (oldVersion < 3) {
      // Entries from before editedAt existed take their last local write.
      // A synced entry's base becomes the server time recorded at its last
      // sync, which the server's edited_at started from. An entry unchanged
      // since then takes the same value as its editedAt, so it stays synced.
      const videos = tx.objectStore(STORE_NAMES.videos);
      videos.openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          return;
        }
        const { updatedAt, syncedAt, syncedServerUpdatedAt, ...entry } =
          cursor.value as VideoIndexEntryV2;
        const unchanged =
          syncedServerUpdatedAt && syncedAt && updatedAt <= syncedAt;
        cursor.update({
          ...entry,
          editedAt: unchanged ? syncedServerUpdatedAt : updatedAt,
          syncedEditedAt: syncedServerUpdatedAt,
        } satisfies VideoIndexEntry);
        cursor.continue();
      };
    }
  },
});

class IdbCaptionStorage implements CaptionStorage {
  listeners = new Set<StorageListener>();

  getSession: CaptionStorage["getSession"] = (youtubeId) =>
    transact(["sessions"], "readonly", ({ sessions }) =>
      sessions.get(youtubeId),
    );

  saveSession: CaptionStorage["saveSession"] = async (session, options) => {
    const entries = await transact(
      ["sessions", "videos"],
      "readwrite",
      async ({ sessions, videos }) => {
        sessions.put(session);
        const existing = await videos.get(session.youtubeId);
        if (!existing && !options?.forceIndex && !session.bookmarks.length) {
          return;
        }
        videos.put({
          youtubeId: session.youtubeId,
          title: session.title,
          channelName: session.channelName,
          bookmarkCount: session.bookmarks.length,
          editedAt: options?.editedAt ?? new Date().toISOString(),
          syncedEditedAt: existing?.syncedEditedAt,
        });
        return videos.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "videoIndex", entries });
    }
  };

  deleteVideo: CaptionStorage["deleteVideo"] = async (youtubeId) => {
    const entries = await transact(
      ["sessions", "videos"],
      "readwrite",
      async ({ sessions, videos }) => {
        sessions.delete(youtubeId);
        videos.delete(youtubeId);
        return videos.getAll();
      },
    );
    this.notify({ type: "videoIndex", entries });
  };

  markSynced: CaptionStorage["markSynced"] = async ({
    youtubeId,
    editedAt,
  }) => {
    const entries = await transact(
      ["videos"],
      "readwrite",
      async ({ videos }) => {
        const existing = await videos.get(youtubeId);
        if (existing) {
          videos.put({
            ...existing,
            syncedEditedAt: editedAt,
          });
        }
        return videos.getAll();
      },
    );
    this.notify({ type: "videoIndex", entries });
  };

  getVideoIndexEntry: CaptionStorage["getVideoIndexEntry"] = (youtubeId) =>
    transact(["videos"], "readonly", ({ videos }) => videos.get(youtubeId));

  listVideoIndex: CaptionStorage["listVideoIndex"] = () =>
    transact(["videos"], "readonly", ({ videos }) => videos.getAll());

  subscribe: CaptionStorage["subscribe"] = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  notify(notice: StorageNotice) {
    for (const l of this.listeners) {
      l(notice);
    }
  }
}

export const idbCaptionStorage = new IdbCaptionStorage();
