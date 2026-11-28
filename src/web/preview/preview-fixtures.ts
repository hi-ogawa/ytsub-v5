import type { VideoListEntry } from "../../components/use-video-list-sync.ts";
import {
  type ExportData,
  importExportData,
} from "../../lib/caption-session.ts";
import { MemoryCaptionStorage } from "./memory-caption-storage.ts";

/** The videos the e2e database is seeded with */
const seedVideos = Object.values(
  import.meta.glob<ExportData>("/scripts/db-seed-json/*/import.json", {
    eager: true,
    import: "default",
  }),
);

export const previewVideoIds = seedVideos.map((data) => data.video.youtubeId);

export async function createPreviewStorage() {
  const storage = new MemoryCaptionStorage();
  for (const data of seedVideos) {
    await importExportData(storage, data);
  }
  return storage;
}

/**
 * One card per sync badge the list can show. The last one exists only on the
 * server, so it has no session and no bookmark count.
 */
export function createPreviewListEntries(): VideoListEntry[] {
  const statuses = ["synced", "push", "conflict"] as const;
  const localEntries = seedVideos.map((data, index) => ({
    youtubeId: data.video.youtubeId,
    title: data.video.title,
    channelName: data.video.channelName ?? "",
    bookmarkCount: data.bookmarks?.length ?? 0,
    editedAt: hoursAgo(index * 20 + 1),
    syncStatus: statuses[index % statuses.length],
  }));
  return [
    ...localEntries,
    {
      youtubeId: "aK8Yh3RTBUY",
      title:
        "260302 타이베이콘서트를 마무리하며. | 유연 코스모 라이브 | YooYeon Cosmo LIVE",
      channelName: "주주",
      editedAt: hoursAgo(72),
      syncStatus: "pull",
    },
  ];
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
