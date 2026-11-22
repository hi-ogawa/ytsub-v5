import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  serverSessionToLocal,
  sessionToExportData,
} from "../lib/caption-session.ts";
import {
  type CaptionStorage,
  videoIndexStore,
} from "../lib/caption-storage.ts";
import { orpc } from "../lib/rpc-client.ts";
import { type VideoSyncEntry, mergeVideoEntries } from "../lib/sync.ts";

export type VideoSyncHandle = ReturnType<typeof useVideoSync>;

export function useVideoSync(storage: CaptionStorage) {
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
      const result = await orpc.videos.importVideo.call(
        sessionToExportData(session),
      );
      await storage.markSynced({
        youtubeId,
        serverUpdatedAt: result.updatedAt,
      });
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
      });
      await storage.markSynced({
        youtubeId,
        serverUpdatedAt: data.video.updatedAt,
      });
    });
  };

  const isPending =
    authQuery.isLoading || (authenticated && serverQuery.isLoading);
  const entries: VideoSyncEntry[] = serverQuery.data ?? videoIndex;

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
