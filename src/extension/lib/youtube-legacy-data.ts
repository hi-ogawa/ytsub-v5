// Before the extension stored data on its own origin, the content script kept
// sessions and the index in youtube.com storage. The copy there is left in
// place, so a failed migration or a downgrade loses nothing.

import type {
  LegacyData,
  PersistedCaptionSession,
} from "../../lib/caption-storage.ts";

const DB_NAME = "zamak";
const SESSIONS = "caption-sessions";
const INDEX_KEY = "zamak:video-index";

export async function readYouTubeLegacyData(): Promise<LegacyData> {
  return {
    index: JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]"),
    sessions: await readSessions(),
  };
}

async function readSessions(): Promise<PersistedCaptionSession[]> {
  // Opening a database that doesn't exist would create an empty one.
  const databases = await indexedDB.databases();
  if (!databases.some((d) => d.name === DB_NAME)) return [];

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!db.objectStoreNames.contains(SESSIONS)) return [];
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction(SESSIONS, "readonly")
        .objectStore(SESSIONS)
        .getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
