import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  serverSessionToLocal,
  sessionToExportData,
} from "../lib/caption-session.ts";
import {
  type CaptionStorage,
  type VideoIndexEntry,
  videoIndexStore,
} from "../lib/caption-storage.ts";
import { orpc } from "../lib/rpc-client.ts";
import { type ComputedSyncState, computeSyncState } from "../lib/sync.ts";
import type { Router } from "../server/rpc.ts";

type ListVideosOutput = InferRouterOutputs<Router>["videos"]["listVideos"];

export type VideoListSync = ReturnType<typeof useVideoListSync>;

export type VideoListEntry = VideoIndexEntry & {
  syncStatus?: ComputedSyncState;
  serverId?: number;
};

/**
 * Sync status, push, and pull for every video on the video list. The web app
 * and the extension share it because both list pages run on their app's own
 * origin, where they read storage and call the server directly.
 */
export function useVideoListSync(storage: CaptionStorage) {
  const [videoIndex] = videoIndexStore.useValue("entries");

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.listVideos.queryOptions({ input: { limit: 200 } }),
    enabled: authenticated,
    select: (data) => mergeVideoEntries(videoIndex, data.items),
  });

  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  const withSyncing = async (youtubeId: string, fn: () => Promise<void>) => {
    setSyncing((s) => new Set(s).add(youtubeId));
    try {
      await fn();
      serverQuery.refetch();
    } catch (err) {
      console.error("[zamak sync]", err);
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing((s) => {
        const next = new Set(s);
        next.delete(youtubeId);
        return next;
      });
    }
  };

  const onPush = async (youtubeId: string) => {
    await withSyncing(youtubeId, async () => {
      const session = await storage.getSession(youtubeId);
      if (!session) {
        throw new Error("No local session found");
      }
      const entry = await storage.getVideoIndexEntry(youtubeId);
      if (!entry) {
        throw new Error("No local index entry found");
      }
      const result = await orpc.videos.importVideo.call(
        sessionToExportData(session, { editedAt: entry.editedAt }),
      );
      await storage.markSynced({ youtubeId, editedAt: result.editedAt });
    });
  };

  const onPull = async (youtubeId: string) => {
    await withSyncing(youtubeId, async () => {
      const data = await orpc.videos.getFullSession.call({ youtubeId });
      if (!data) {
        throw new Error("Video not found on server");
      }
      await storage.saveSession(serverSessionToLocal(data), {
        forceIndex: true,
        editedAt: data.video.editedAt,
      });
      await storage.markSynced({ youtubeId, editedAt: data.video.editedAt });
    });
  };

  const isPending =
    authQuery.isLoading || (authenticated && serverQuery.isLoading);
  const entries: VideoListEntry[] = serverQuery.data ?? videoIndex;

  return {
    authenticated,
    isPending,
    entries,
    syncing,
    onPull,
    onPush,
    refetch: async () => {
      const result = await authQuery.refetch();
      if (result.data?.authenticated) {
        serverQuery.refetch();
      }
    },
  };
}

function mergeVideoEntries(
  localEntries: VideoIndexEntry[],
  serverVideos: ListVideosOutput["items"],
): VideoListEntry[] {
  const merged = new Map<string, VideoListEntry>();

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
        editedAt: server.editedAt,
        serverId: server.id,
        syncStatus: "pull",
      });
    }
  }

  return Array.from(merged.values());
}
