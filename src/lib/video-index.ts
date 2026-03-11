export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
};

import { notifyLocalStorage } from "./use-local-storage.ts";

const KEY = "zamak:video-index";

function getVideoIndex(): VideoIndexEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VideoIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: VideoIndexEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
  notifyLocalStorage(KEY);
}

export function updateVideoIndex(
  youtubeId: string,
  title: string,
  channelName: string,
  bookmarkCount: number,
) {
  const entries = getVideoIndex();
  const idx = entries.findIndex((e) => e.youtubeId === youtubeId);
  const entry: VideoIndexEntry = {
    youtubeId,
    title,
    channelName,
    bookmarkCount,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  writeIndex(entries);
}

export function removeFromVideoIndex(youtubeId: string) {
  const entries = getVideoIndex().filter((e) => e.youtubeId !== youtubeId);
  writeIndex(entries);
}
