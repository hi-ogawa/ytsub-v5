import { createTransact } from "../utils/idb.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
  StorageListener,
  StorageNotice,
  VideoIndexEntry,
} from "./caption-storage.ts";

const DB_NAME = "zamak";
const DB_VERSION = 2;

type Stores = { sessions: PersistedCaptionSession; videos: VideoIndexEntry };

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  videos: "videos",
};

const transact = createTransact<Stores>({ openDb, storeNames: STORE_NAMES });

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
          updatedAt: new Date().toISOString(),
          syncedAt: existing?.syncedAt,
          syncedServerUpdatedAt: existing?.syncedServerUpdatedAt,
        });
        return videos.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
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
    this.notify({ type: "index", entries });
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
    this.notify({ type: "index", entries });
  };

  getIndexEntry: CaptionStorage["getIndexEntry"] = (youtubeId) =>
    transact(["videos"], "readonly", ({ videos }) => videos.get(youtubeId));

  listIndex: CaptionStorage["listIndex"] = () =>
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

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore(STORE_NAMES.sessions, { keyPath: "youtubeId" });
      }
      if (e.oldVersion < 2) {
        db.createObjectStore(STORE_NAMES.videos, { keyPath: "youtubeId" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version of the app upgrade the database.
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
