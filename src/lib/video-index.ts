import { createLocalStorageStore } from "./external-store.ts";

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncedAt?: string;
};

export const VIDEO_INDEX_KEY = "zamak:video-index";

export const videoIndexStore = createLocalStorageStore<VideoIndexEntry[]>(
  VIDEO_INDEX_KEY,
  [],
);

/** Update an existing entry in the video index. No-op if not in index. */
export function updateVideoIndex(
  youtubeId: string,
  title: string,
  channelName: string,
  bookmarkCount: number,
) {
  videoIndexStore.set((entries) => {
    const idx = entries.findIndex((e) => e.youtubeId === youtubeId);
    if (idx < 0) return entries;
    return entries.map((e, i) =>
      i === idx
        ? {
            ...e,
            title,
            channelName,
            bookmarkCount,
            updatedAt: new Date().toISOString(),
          }
        : e,
    );
  });
}

/** Add a video to the index (library). No-op if already present. */
export function addToVideoIndex(
  youtubeId: string,
  title: string,
  channelName: string,
  bookmarkCount: number,
) {
  videoIndexStore.set((entries) => {
    if (entries.some((e) => e.youtubeId === youtubeId)) return entries;
    return [
      ...entries,
      {
        youtubeId,
        title,
        channelName,
        bookmarkCount,
        updatedAt: new Date().toISOString(),
      },
    ];
  });
}

export function removeFromVideoIndex(youtubeId: string) {
  videoIndexStore.set((entries) =>
    entries.filter((e) => e.youtubeId !== youtubeId),
  );
}

export function setSyncedAt(youtubeId: string) {
  videoIndexStore.set((entries) =>
    entries.map((e) =>
      e.youtubeId === youtubeId
        ? { ...e, syncedAt: new Date().toISOString() }
        : e,
    ),
  );
}
