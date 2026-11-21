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

// Marks a legacy source as imported.
type MetaRecord = { key: string; importedAt: string };

type Stores = {
  sessions: PersistedCaptionSession;
  index: VideoIndexEntry;
  meta: MetaRecord;
};

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  index: "video-index",
  meta: "meta",
};

const transact = createTransact<Stores>({ openDb, storeNames: STORE_NAMES });

const CHANNEL_NAME = "zamak:storage";

class IdbCaptionStorage implements CaptionStorage {
  listeners = new Set<StorageListener>();
  channel: BroadcastChannel | undefined;

  getSession: CaptionStorage["getSession"] = (youtubeId) =>
    transact(["sessions"], "readonly", ({ sessions }) =>
      sessions.get(youtubeId),
    );

  saveSession: CaptionStorage["saveSession"] = async (session, options) => {
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
    this.notify({ type: "session-saved", youtubeId: session.youtubeId });
    if (entries) {
      this.notify({ type: "index", entries });
    }
  };

  deleteVideo: CaptionStorage["deleteVideo"] = async (youtubeId) => {
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
  };

  setSyncedAt: CaptionStorage["setSyncedAt"] = async (
    youtubeId,
    serverUpdatedAt,
  ) => {
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
  };

  getIndexEntry: CaptionStorage["getIndexEntry"] = (youtubeId) =>
    transact(["index"], "readonly", ({ index }) => index.get(youtubeId));

  listIndex: CaptionStorage["listIndex"] = () =>
    transact(["index"], "readonly", ({ index }) => index.getAll());

  // One transaction checks the marker and writes everything, so concurrent
  // imports run one after the other, and an interrupted one leaves nothing.
  importLegacy: CaptionStorage["importLegacy"] = async (source, data) => {
    const entries = await transact(
      ["sessions", "index", "meta"],
      "readwrite",
      async ({ sessions, index, meta }) => {
        const key = importMarkerKey(source);
        if (await meta.get(key)) {
          return;
        }
        const winners = new Set<string>();
        for (const entry of data.index) {
          const existing = await index.get(entry.youtubeId);
          if (!existing || entry.updatedAt > existing.updatedAt) {
            index.put(entry);
            winners.add(entry.youtubeId);
          }
        }
        for (const session of data.sessions) {
          const keep =
            winners.has(session.youtubeId) ||
            !(await sessions.get(session.youtubeId));
          if (keep) {
            sessions.put(session);
          }
        }
        meta.put({ key, importedAt: new Date().toISOString() });
        return index.getAll();
      },
    );
    if (entries) {
      this.notify({ type: "index", entries });
    }
  };

  isLegacyImported: CaptionStorage["isLegacyImported"] = async (source) =>
    !!(await transact(["meta"], "readonly", ({ meta }) =>
      meta.get(importMarkerKey(source)),
    ));

  subscribe: CaptionStorage["subscribe"] = (listener) => {
    this.getChannel();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  notify(notice: StorageNotice) {
    for (const l of this.listeners) {
      l(notice, true);
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
            l(e.data, false);
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
        db.createObjectStore(STORE_NAMES.meta, { keyPath: "key" });
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
