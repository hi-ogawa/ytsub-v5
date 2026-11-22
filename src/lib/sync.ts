import type { InferRouterOutputs } from "@orpc/server";
import type { Router } from "../server/rpc.ts";
import type { CaptionPanelRuntime } from "./caption-panel-runtime.ts";
import type { VideoIndexEntry } from "./caption-storage.ts";

type ListVideosOutput = InferRouterOutputs<Router>["videos"]["listVideos"];

export type SyncState =
  | "unauthenticated"
  | "checking"
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "syncing"
  | "error"
  | "empty";

export type ComputedSyncState =
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "empty";

export function computeSyncState(params: {
  localUpdatedAt?: string;
  syncedAt?: string;
  syncedServerUpdatedAt?: string;
  serverUpdatedAt?: string;
}): ComputedSyncState {
  const { localUpdatedAt, syncedAt, syncedServerUpdatedAt, serverUpdatedAt } =
    params;

  // No local entry
  if (!localUpdatedAt) {
    return serverUpdatedAt ? "pull" : "empty";
  }

  // syncedAt without localUpdatedAt is structurally impossible (syncedAt lives on VideoIndexEntry)
  // but handled above. syncedAt without serverUpdatedAt is degenerate (server data deleted).

  if (!syncedAt) {
    if (!serverUpdatedAt) {
      return "push";
    }
    return "conflict";
  }

  // Server data gone after a previous sync — need to re-push
  if (!serverUpdatedAt) {
    return "push";
  }

  // Each comparison stays within one clock, because the client and server
  // clocks can disagree. Entries synced before syncedServerUpdatedAt existed
  // fall back to the local syncedAt.
  const localChanged = localUpdatedAt > syncedAt;
  const serverChanged = serverUpdatedAt > (syncedServerUpdatedAt ?? syncedAt);

  if (!localChanged && !serverChanged) {
    return "synced";
  }
  if (localChanged && !serverChanged) {
    return "push";
  }
  if (!localChanged && serverChanged) {
    return "pull";
  }
  return "conflict";
}

export type SyncStatus = {
  state: SyncState;
  error?: string;
  onNavigate: () => void;
  onPush: (runtime: CaptionPanelRuntime) => void;
  onPull: (runtime: CaptionPanelRuntime) => void;
};

export type UseSync = (options: { youtubeId: string }) => SyncStatus;

export type VideoListEntry = VideoIndexEntry & {
  syncStatus?: ComputedSyncState;
  serverId?: number;
};

export function mergeVideoEntries(
  localEntries: VideoIndexEntry[],
  serverVideos: ListVideosOutput["items"],
): VideoListEntry[] {
  const merged = new Map<string, VideoListEntry>();

  for (const local of localEntries) {
    const server = serverVideos.find((v) => v.youtubeId === local.youtubeId);
    const status = computeSyncState({
      localUpdatedAt: local.updatedAt,
      syncedAt: local.syncedAt,
      syncedServerUpdatedAt: local.syncedServerUpdatedAt,
      serverUpdatedAt: server?.updatedAt ?? undefined,
    });
    merged.set(local.youtubeId, {
      youtubeId: local.youtubeId,
      title: local.title,
      channelName: local.channelName,
      bookmarkCount: local.bookmarkCount,
      updatedAt: local.updatedAt,
      serverId: server?.id,
      syncStatus: status,
    });
  }

  for (const server of serverVideos) {
    if (!merged.has(server.youtubeId)) {
      merged.set(server.youtubeId, {
        youtubeId: server.youtubeId,
        title: server.title,
        channelName: server.channelName,
        bookmarkCount: 0,
        updatedAt: server.updatedAt,
        serverId: server.id,
        syncStatus: "pull",
      });
    }
  }

  return Array.from(merged.values());
}
