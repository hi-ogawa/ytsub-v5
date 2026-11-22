import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Router } from "../server/rpc.ts";
import type { CaptionPanelRuntime } from "./caption-panel-runtime.ts";
import { sessionToExportData } from "./caption-session.ts";
import {
  type CaptionStorage,
  type PersistedCaptionSession,
  type VideoIndexEntry,
  videoIndexStore,
} from "./caption-storage.ts";
import { orpc } from "./rpc-client.ts";

type ListVideosOutput = InferRouterOutputs<Router>["videos"]["listVideos"];
type GetFullSessionOutput = NonNullable<
  InferRouterOutputs<Router>["videos"]["getFullSession"]
>;

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

export function useVideoIndexEntry({
  storage,
  youtubeId,
}: {
  storage: CaptionStorage;
  youtubeId: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["video-index-entry", youtubeId],
    // React Query rejects undefined data.
    queryFn: async () => (await storage.getVideoIndexEntry(youtubeId)) ?? null,
  });

  useEffect(
    () =>
      storage.subscribe((notice) => {
        if (notice.type === "videoIndex") {
          queryClient.invalidateQueries({
            queryKey: ["video-index-entry", youtubeId],
          });
        }
      }),
    [storage, queryClient, youtubeId],
  );

  return query;
}

export function useSyncState({
  storage,
  youtubeId,
  onNavigate,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  onNavigate: () => void;
}): SyncStatus {
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.getVideoEditedAt.queryOptions({
      input: { youtubeId },
    }),
    enabled: authenticated,
  });

  const syncMutation = useMutation({
    mutationFn: async (action: {
      direction: "push" | "pull";
      runtime: CaptionPanelRuntime;
    }) => {
      if (action.direction === "push") {
        const entry = await storage.getVideoIndexEntry(youtubeId);
        if (!entry) {
          throw new Error("No local index entry found");
        }
        const result = await orpc.videos.importVideo.call(
          action.runtime.toExportData({ editedAt: entry.editedAt }),
        );
        await storage.markSynced({ youtubeId, editedAt: result.editedAt });
      } else {
        const data = await orpc.videos.getFullSession.call({ youtubeId });
        if (!data) {
          throw new Error("Video not found on server");
        }
        const session = serverSessionToLocal(data);
        await action.runtime.replace({
          vssId1: session.vssId1,
          vssId2: session.vssId2,
          captions: session.captions,
          bookmarks: session.bookmarks,
          editedAt: data.video.editedAt,
        });
        await storage.markSynced({ youtubeId, editedAt: data.video.editedAt });
      }
    },
    onSuccess: () => serverQuery.refetch(),
  });

  const getState = (): SyncState => {
    if (syncMutation.isPending) {
      return "syncing";
    }
    if (authQuery.isFetching) {
      return "checking";
    }
    if (!authenticated) {
      return "unauthenticated";
    }
    if (serverQuery.isLoading) {
      return "checking";
    }
    if (serverQuery.isError) {
      return "error";
    }
    if (entryQuery.isPending) {
      return "checking";
    }
    const localEntry = entryQuery.data ?? undefined;
    return computeSyncState({
      localEditedAt: localEntry?.editedAt,
      syncedEditedAt: localEntry?.syncedEditedAt,
      serverEditedAt: serverQuery.data?.editedAt,
    });
  };

  const { error, variables } = syncMutation;

  return {
    state: getState(),
    error: error
      ? `${variables?.direction === "pull" ? "Download" : "Upload"} failed: ${error.message}`
      : undefined,
    onNavigate,
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}

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

function mergeVideoEntries(
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

export function serverSessionToLocal(
  data: GetFullSessionOutput,
): PersistedCaptionSession {
  return {
    youtubeId: data.video.youtubeId,
    title: data.video.title,
    channelName: data.video.channelName,
    channelId: data.video.channelId,
    duration: data.video.duration,
    vssId1: data.video.vssId1,
    vssId2: data.video.vssId2,
    language1: data.video.language1,
    language2: data.video.language2,
    captions: data.captions.map((c) => ({
      idx: c.idx,
      begin: c.begin,
      end: c.end,
      text1: c.text1,
      text2: c.text2,
      cue1Indices: [] as number[],
      cue2Indices: [] as number[],
      text1Segments: [c.text1],
      text2Segments: [c.text2],
    })),
    bookmarks: data.bookmarks.map((b) => ({
      id: String(b.id),
      text: b.text,
      side: b.side,
      offset: b.offset,
      captionIndex: data.captions.findIndex((c) => c.id === b.captionId),
      timestamp: b.timestamp,
      context: b.context,
      translation: b.translation,
      etymology: b.etymology,
      notes: b.notes,
      createdAt: b.createdAt,
    })),
  };
}
