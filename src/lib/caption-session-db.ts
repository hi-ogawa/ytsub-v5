import type { MergeStrategy, MergedCaption } from "./caption-merge.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";

export interface PersistedCaptionSession {
  youtubeId: string;
  vssId1: string;
  vssId2: string;
  language1: string;
  language2: string;
  strategy?: MergeStrategy;
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
}

const DB_NAME = "zamak";
const STORE_NAME = "caption-sessions";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "youtubeId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSession(
  youtubeId: string,
): Promise<PersistedCaptionSession | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(youtubeId);
    req.onsuccess = () =>
      resolve(req.result as PersistedCaptionSession | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(
  session: PersistedCaptionSession,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSession(youtubeId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(youtubeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
