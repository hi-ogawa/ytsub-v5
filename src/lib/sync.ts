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

// Each side's edit time changes with every edit and is copied unchanged by
// push and pull, so comparing it for equality with its value at the last sync
// tells whether that side changed, whatever the clocks say.
export function computeSyncState(params: {
  localEditedAt?: string;
  syncedEditedAt?: string;
  serverEditedAt?: string;
}): ComputedSyncState {
  const { localEditedAt, syncedEditedAt, serverEditedAt } = params;

  // No local entry
  if (!localEditedAt) {
    return serverEditedAt ? "pull" : "empty";
  }

  if (!syncedEditedAt) {
    return serverEditedAt ? "conflict" : "push";
  }

  // Server data gone after a previous sync — need to re-push
  if (!serverEditedAt) {
    return "push";
  }

  const localChanged = localEditedAt !== syncedEditedAt;
  const serverChanged = serverEditedAt !== syncedEditedAt;

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

export type VideoSyncEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  // Absent for a video that exists only on the server, whose video list has
  // no bookmark count
  bookmarkCount?: number;
  editedAt: string;
  syncStatus?: ComputedSyncState;
  serverId?: number;
  serverEditedAt?: string;
};

export function mergeVideoEntries(
  localEntries: VideoIndexEntry[],
  serverVideos: ListVideosOutput["items"],
): VideoSyncEntry[] {
  const merged = new Map<string, VideoSyncEntry>();

  for (const local of localEntries) {
    const server = serverVideos.find((v) => v.youtubeId === local.youtubeId);
    const status = computeSyncState({
      localEditedAt: local.editedAt,
      syncedEditedAt: local.syncedEditedAt,
      serverEditedAt: server?.editedAt,
    });
    merged.set(local.youtubeId, {
      youtubeId: local.youtubeId,
      title: local.title,
      channelName: local.channelName,
      bookmarkCount: local.bookmarkCount,
      editedAt: local.editedAt,
      serverId: server?.id,
      serverEditedAt: server?.editedAt,
      syncStatus: status,
    });
  }

  for (const server of serverVideos) {
    if (!merged.has(server.youtubeId)) {
      merged.set(server.youtubeId, {
        youtubeId: server.youtubeId,
        title: server.title,
        channelName: server.channelName,
        editedAt: server.editedAt,
        serverId: server.id,
        serverEditedAt: server.editedAt,
        syncStatus: "pull",
      });
    }
  }

  return Array.from(merged.values());
}
