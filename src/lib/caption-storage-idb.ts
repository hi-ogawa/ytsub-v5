import { createTransact, type StoreMap } from "../utils/idb.ts";
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
    await this.updateIndex(["sessions"], async ({ sessions, index }) => {
      sessions.put(session);
      const existing = await index.get(session.youtubeId);
      if (!existing && !options?.forceIndex && !session.bookmarks.length) {
        return false;
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
    });
  }

  async deleteVideo(youtubeId: string) {
    await this.updateIndex(["sessions"], async ({ sessions, index }) => {
      sessions.delete(youtubeId);
      index.delete(youtubeId);
    });
  }

  async setSyncedAt(youtubeId: string, serverUpdatedAt: string) {
    await this.updateIndex([], async ({ index }) => {
      const existing = await index.get(youtubeId);
      if (existing) {
        index.put({
          ...existing,
          syncedAt: new Date().toISOString(),
          syncedServerUpdatedAt: serverUpdatedAt,
        });
      }
    });
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

  // Runs a write that may change the index, then notifies listeners with the
  // whole index read back in the same transaction. The write returns false to
  // skip the notice.
  async updateIndex<K extends keyof Stores>(
    names: K[],
    write: (stores: StoreMap<Stores, K | "index">) => Promise<void | false>,
  ) {
    const entries = await transact(
      [...names, "index"],
      "readwrite",
      async (stores) => {
        if ((await write(stores)) === false) {
          return undefined;
        }
        return stores.index.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
    }
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
