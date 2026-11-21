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
  videos: VideoIndexEntry;
  meta: MetaRecord;
};

const STORE_NAMES: { [K in keyof Stores]: string } = {
  sessions: "caption-sessions",
  videos: "videos",
  meta: "meta",
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
      db.createObjectStore(STORE_NAMES.meta, { keyPath: "key" });
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

  // One transaction checks the marker and writes everything, so concurrent
  // imports run one after the other, and an interrupted one leaves nothing.
  importLegacy: CaptionStorage["importLegacy"] = async (source, data) => {
    const entries = await transact(
      ["sessions", "videos", "meta"],
      "readwrite",
      async ({ sessions, videos, meta }) => {
        const key = importMarkerKey(source);
        if (await meta.get(key)) {
          return;
        }
        const winners = new Set<string>();
        for (const entry of data.index) {
          const existing = await videos.get(entry.youtubeId);
          if (!existing || entry.updatedAt > existing.updatedAt) {
            videos.put(entry);
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
        return videos.getAll();
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

function importMarkerKey(source: string) {
  return `imported:${source}`;
}
