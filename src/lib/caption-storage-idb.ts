import { createTransact } from "../utils/idb.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
  StorageListener,
  StorageNotice,
  VideoEntry,
} from "./caption-storage.ts";

const DB_NAME = "zamak";
const DB_VERSION = 2;

type Stores = { sessions: PersistedCaptionSession; videos: VideoEntry };

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  videos: "videos",
};

const transact = createTransact<Stores>({
  name: DB_NAME,
  version: DB_VERSION,
  storeNames: STORE_NAMES,
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore(STORE_NAMES.sessions, { keyPath: "youtubeId" });
    }
    if (oldVersion < 2) {
      db.createObjectStore(STORE_NAMES.videos, { keyPath: "youtubeId" });
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
        if (!existing && !options?.forceEntry && !session.bookmarks.length) {
          return;
        }
        videos.put({
          youtubeId: session.youtubeId,
          title: session.title,
          channelName: session.channelName,
          bookmarkCount: session.bookmarks.length,
          updatedAt: new Date().toISOString(),
          syncedAt: existing?.syncedAt,
          syncedServerUpdatedAt: existing?.syncedServerUpdatedAt,
        });
        return videos.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "videos", entries });
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
    this.notify({ type: "videos", entries });
  };

  setSyncedAt: CaptionStorage["setSyncedAt"] = async (
    youtubeId,
    serverUpdatedAt,
  ) => {
    const entries = await transact(
      ["videos"],
      "readwrite",
      async ({ videos }) => {
        const existing = await videos.get(youtubeId);
        if (existing) {
          videos.put({
            ...existing,
            syncedAt: new Date().toISOString(),
            syncedServerUpdatedAt: serverUpdatedAt,
          });
        }
        return videos.getAll();
      },
    );
    this.notify({ type: "videos", entries });
  };

  getVideo: CaptionStorage["getVideo"] = (youtubeId) =>
    transact(["videos"], "readonly", ({ videos }) => videos.get(youtubeId));

  listVideos: CaptionStorage["listVideos"] = () =>
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
