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

type Stores = { sessions: PersistedCaptionSession; index: VideoIndexEntry };

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  index: "video-index",
};

const transact = createTransact<Stores>({ openDb, storeNames: STORE_NAMES });

class IdbCaptionStorage implements CaptionStorage {
  listeners = new Set<StorageListener>();

  async getSession(youtubeId: string) {
    return transact(["sessions"], "readonly", ({ sessions }) =>
      sessions.get(youtubeId),
    );
  }

  async saveSession(
    session: PersistedCaptionSession,
    options?: { forceIndex?: boolean },
  ) {
    const entries = await transact(
      ["sessions", "index"],
      "readwrite",
      async ({ sessions, index }) => {
        sessions.put(session);
        const existing = await index.get(session.youtubeId);
        if (!existing && !options?.forceIndex && !session.bookmarks.length) {
          return;
        }
        index.put({
          youtubeId: session.youtubeId,
          title: session.title,
          channelName: session.channelName,
          bookmarkCount: session.bookmarks.length,
          updatedAt: new Date().toISOString(),
          syncedAt: existing?.syncedAt,
          syncedServerUpdatedAt: existing?.syncedServerUpdatedAt,
        });
        return index.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
    }
  }

  async deleteVideo(youtubeId: string) {
    const entries = await transact(
      ["sessions", "index"],
      "readwrite",
      async ({ sessions, index }) => {
        sessions.delete(youtubeId);
        index.delete(youtubeId);
        return index.getAll();
      },
    );
    this.notify({ type: "index", entries });
  }

  async setSyncedAt(youtubeId: string, serverUpdatedAt: string) {
    const entries = await transact(
      ["index"],
      "readwrite",
      async ({ index }) => {
        const existing = await index.get(youtubeId);
        if (existing) {
          index.put({
            ...existing,
            syncedAt: new Date().toISOString(),
            syncedServerUpdatedAt: serverUpdatedAt,
          });
        }
        return index.getAll();
      },
    );
    this.notify({ type: "index", entries });
  }

  async listIndex() {
    return transact(["index"], "readonly", ({ index }) => index.getAll());
  }

  subscribe(listener: StorageListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

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
        db.createObjectStore(STORE_NAMES.index, { keyPath: "youtubeId" });
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
