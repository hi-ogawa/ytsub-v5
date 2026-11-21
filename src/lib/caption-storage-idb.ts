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

type Store<T> = {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): void;
  delete(key: string): void;
};

type StoreMap<K extends keyof Stores> = { [P in K]: Store<Stores[P]> };

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
    write: (stores: StoreMap<K | "index">) => Promise<void | false>,
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

// --- IndexedDB helpers ---

// `fn` may await requests on its stores, because a transaction stays active
// through promise callbacks run from its request events.
async function transact<K extends keyof Stores, R>(
  names: K[],
  mode: IDBTransactionMode,
  fn: (stores: StoreMap<K>) => Promise<R>,
): Promise<R> {
  const db = await openDb();
  const tx = db.transaction(
    names.map((name) => STORE_NAMES[name]),
    mode,
  );
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
  const stores = Object.fromEntries(
    names.map((name) => [name, wrapStore(tx.objectStore(STORE_NAMES[name]))]),
  ) as StoreMap<K>;
  let result: R;
  try {
    result = await fn(stores);
  } catch (err) {
    done.catch(() => {});
    try {
      tx.abort();
    } catch {}
    throw err;
  }
  await done;
  return result;
}

function wrapStore<T>(store: IDBObjectStore): Store<T> {
  return {
    get: (key) => requestResult(store.get(key)),
    getAll: () => requestResult(store.getAll()),
    put: (value) => {
      store.put(value);
    },
    delete: (key) => {
      store.delete(key);
    },
  };
}

function requestResult<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

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
