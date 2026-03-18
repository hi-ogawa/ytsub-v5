import { createLocalStorageStore } from "./external-store.ts";

export type VideoIndexEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: number;
  syncedAt?: number;
};

export const VIDEO_INDEX_KEY = "zamak:video-index";

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeEpochSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
}

function normalizeVideoIndexEntry(value: unknown): VideoIndexEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.youtubeId !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.channelName !== "string" ||
    typeof entry.bookmarkCount !== "number"
  ) {
    return undefined;
  }
  const updatedAt = normalizeEpochSeconds(entry.updatedAt);
  if (updatedAt === undefined) return undefined;
  return {
    youtubeId: entry.youtubeId,
    title: entry.title,
    channelName: entry.channelName,
    bookmarkCount: entry.bookmarkCount,
    updatedAt,
    syncedAt: normalizeEpochSeconds(entry.syncedAt),
  };
}

export const videoIndexStore = createLocalStorageStore<VideoIndexEntry[]>(
  VIDEO_INDEX_KEY,
  [],
  (value) =>
    Array.isArray(value)
      ? value
          .map((entry) => normalizeVideoIndexEntry(entry))
          .filter((entry) => entry !== undefined)
      : [],
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
      updatedAt: nowEpochSeconds(),
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
      e.youtubeId === youtubeId ? { ...e, syncedAt: nowEpochSeconds() } : e,
    ),
  );
}
