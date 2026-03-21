import { createLocalStorageStore } from "./external-store.ts";

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncedAt?: string;
};

export const videoIndexStore = createLocalStorageStore<VideoIndexEntry[]>(
  "zamak:video-index",
  [],
);

export function updateVideoIndex(
  youtubeId: string,
  title: string,
  channelName: string,
  bookmarkCount: number,
) {
  videoIndexStore.set((entries) => {
    const idx = entries.findIndex((e) => e.youtubeId === youtubeId);
    const existing = idx >= 0 ? entries[idx] : undefined;
    const entry: VideoIndexEntry = {
      youtubeId,
      title,
      channelName,
      bookmarkCount,
      updatedAt: new Date().toISOString(),
      syncedAt: existing?.syncedAt,
    };
    const next = [...entries];
    if (idx >= 0) next[idx] = entry;
    else next.push(entry);
    return next;
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
