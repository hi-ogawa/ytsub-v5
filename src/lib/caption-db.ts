import type {
  CaptionStorage,
  LegacyData,
  PersistedCaptionSession,
  StorageListener,
  StorageNotice,
} from "./caption-storage.ts";
import type { VideoIndexEntry } from "./video-index.ts";

const DB_NAME = "zamak";
const DB_VERSION = 2;
const SESSIONS = "caption-sessions";
const INDEX = "video-index";
const META = "meta";

const CHANNEL_NAME = "zamak:storage";

class IdbCaptionStorage implements CaptionStorage {
  listeners = new Set<StorageListener>();
  channel: BroadcastChannel | undefined;

  async getSession(youtubeId: string) {
    return withTransaction([SESSIONS], "readonly", (tx) =>
      requestResult<PersistedCaptionSession | undefined>(
        tx.objectStore(SESSIONS).get(youtubeId),
      ),
    );
  }

  async saveSession(
    session: PersistedCaptionSession,
    options?: { forceIndex?: boolean },
  ) {
    const entries = await withTransaction(
      [SESSIONS, INDEX],
      "readwrite",
      async (tx) => {
        tx.objectStore(SESSIONS).put(session);
        const index = tx.objectStore(INDEX);
        const existing = await requestResult<VideoIndexEntry | undefined>(
          index.get(session.youtubeId),
        );
        if (!existing && !options?.forceIndex && !session.bookmarks.length) {
          return undefined;
        }
        index.put({
          youtubeId: session.youtubeId,
          title: session.title,
          channelName: session.channelName,
          bookmarkCount: session.bookmarks.length,
          updatedAt: new Date().toISOString(),
          syncedAt: existing?.syncedAt,
          syncedServerUpdatedAt: existing?.syncedServerUpdatedAt,
        } satisfies VideoIndexEntry);
        return await requestResult<VideoIndexEntry[]>(index.getAll());
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
    }
  }

  async deleteVideo(youtubeId: string) {
    const entries = await withTransaction(
      [SESSIONS, INDEX],
      "readwrite",
      async (tx) => {
        tx.objectStore(SESSIONS).delete(youtubeId);
        tx.objectStore(INDEX).delete(youtubeId);
        return await requestResult<VideoIndexEntry[]>(
          tx.objectStore(INDEX).getAll(),
        );
      },
    );
    this.notify({ type: "index", entries });
  }

  async setSyncedAt(youtubeId: string, serverUpdatedAt: string) {
    const entries = await withTransaction([INDEX], "readwrite", async (tx) => {
      const index = tx.objectStore(INDEX);
      const existing = await requestResult<VideoIndexEntry | undefined>(
        index.get(youtubeId),
      );
      if (existing) {
        index.put({
          ...existing,
          syncedAt: new Date().toISOString(),
          syncedServerUpdatedAt: serverUpdatedAt,
        } satisfies VideoIndexEntry);
      }
      return await requestResult<VideoIndexEntry[]>(index.getAll());
    });
    this.notify({ type: "index", entries });
  }

  async listIndex() {
    return withTransaction([INDEX], "readonly", (tx) =>
      requestResult<VideoIndexEntry[]>(tx.objectStore(INDEX).getAll()),
    );
  }

  // One transaction checks the marker and writes everything, so concurrent
  // imports run one after the other, and an interrupted one leaves nothing.
  async importLegacy(source: string, data: LegacyData) {
    const entries = await withTransaction(
      [SESSIONS, INDEX, META],
      "readwrite",
      async (tx) => {
        const meta = tx.objectStore(META);
        const marker = await requestResult(meta.get(importMarkerKey(source)));
        if (marker !== undefined) {
          return undefined;
        }

        const index = tx.objectStore(INDEX);
        const sessions = tx.objectStore(SESSIONS);
        const winners = new Set<string>();
        for (const entry of data.index) {
          const existing = await requestResult<VideoIndexEntry | undefined>(
            index.get(entry.youtubeId),
          );
          if (!existing || entry.updatedAt > existing.updatedAt) {
            index.put(entry);
            winners.add(entry.youtubeId);
          }
        }
        for (const session of data.sessions) {
          const keep =
            winners.has(session.youtubeId) ||
            (await requestResult(sessions.getKey(session.youtubeId))) ===
              undefined;
          if (keep) {
            sessions.put(session);
          }
        }
        meta.put(new Date().toISOString(), importMarkerKey(source));
        return await requestResult<VideoIndexEntry[]>(index.getAll());
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
    }
  }

  async isLegacyImported(source: string) {
    const marker = await withTransaction([META], "readonly", (tx) =>
      requestResult(tx.objectStore(META).get(importMarkerKey(source))),
    );
    return marker !== undefined;
  }

  subscribe(listener: StorageListener) {
    this.getChannel();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(notice: StorageNotice) {
    for (const l of this.listeners) {
      l(notice);
    }
    this.getChannel().postMessage(notice);
  }

  // Other contexts on this origin hear each write over the channel.
  getChannel() {
    if (!this.channel) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.addEventListener(
        "message",
        (e: MessageEvent<StorageNotice>) => {
          for (const l of this.listeners) {
            l(e.data);
          }
        },
      );
    }
    return this.channel;
  }
}

export const idbCaptionStorage = new IdbCaptionStorage();

function importMarkerKey(source: string) {
  return `imported:${source}`;
}

// --- IndexedDB helpers ---

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore(SESSIONS, { keyPath: "youtubeId" });
      }
      if (e.oldVersion < 2) {
        db.createObjectStore(INDEX, { keyPath: "youtubeId" });
        db.createObjectStore(META);
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

// The body may await requests on `tx`, because a transaction stays active
// through promise callbacks run from its request events.
async function withTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
  let result: T;
  try {
    result = await body(tx);
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

function requestResult<T = unknown>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
