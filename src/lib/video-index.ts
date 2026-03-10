export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncedAt?: string;
};

const KEY = "zamak:video-index";
export const VIDEO_INDEX_EVENT = "zamak:video-index-updated";

export function getVideoIndex(): VideoIndexEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VideoIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: VideoIndexEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(VIDEO_INDEX_EVENT));
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

export function setSyncedAt(youtubeId: string) {
  const entries = getVideoIndex();
  const entry = entries.find((e) => e.youtubeId === youtubeId);
  if (entry) {
    entry.syncedAt = new Date().toISOString();
    writeIndex(entries);
  }
}

export function getVideoIndexEntry(
  youtubeId: string,
): VideoIndexEntry | undefined {
  return getVideoIndex().find((e) => e.youtubeId === youtubeId);
}
