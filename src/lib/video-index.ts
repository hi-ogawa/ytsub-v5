type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
};

const KEY = "zamak:video-index";
const EVENT_NAME = "zamak:video-index-updated";

function getIndex(): VideoIndexEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VideoIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: VideoIndexEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
  // Signal to ISOLATED world relay script (shares DOM, reads localStorage)
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function updateVideoIndex(
  youtubeId: string,
  title: string,
  channelName: string,
  bookmarkCount: number,
) {
  const entries = getIndex();
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
  const entries = getIndex().filter((e) => e.youtubeId !== youtubeId);
  writeIndex(entries);
}
