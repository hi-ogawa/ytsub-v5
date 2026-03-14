import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { orpc } from "../rpc.ts";
import { getSession, saveSession } from "./caption-session-db.ts";
import type { CaptionSessionManager } from "./caption-session.ts";
import { useStore } from "./external-store.ts";
import {
  setSyncedAt,
  updateVideoIndex,
  videoIndexStore,
} from "./video-index.ts";

type SyncState =
  | "unauthenticated"
  | "checking"
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "syncing"
  | "error";

export function computeSyncState(params: {
  localUpdatedAt?: string;
  syncedAt?: string;
  serverUpdatedAt?: string;
}): SyncState {
  const { localUpdatedAt, syncedAt, serverUpdatedAt } = params;
  if (!localUpdatedAt && !serverUpdatedAt) return "synced";

  if (!syncedAt) {
    if (localUpdatedAt && !serverUpdatedAt) return "push";
    if (!localUpdatedAt && serverUpdatedAt) return "pull";
    if (localUpdatedAt && serverUpdatedAt) return "conflict";
    return "synced";
  }

  const localChanged = localUpdatedAt ? localUpdatedAt > syncedAt : false;
  const serverChanged = serverUpdatedAt ? serverUpdatedAt > syncedAt : false;

  if (!localChanged && !serverChanged) return "synced";
  if (localChanged && !serverChanged) return "push";
  if (!localChanged && serverChanged) return "pull";
  return "conflict";
}

type SyncDirection = "push" | "pull";

export type SyncHandle = ReturnType<typeof useSyncState>;

export function useSyncState({ youtubeId }: { youtubeId: string }) {
  const queryClient = useQueryClient();
  const [syncVersion, setSyncVersion] = useState(0);

  const [videoIndex] = useStore(videoIndexStore);

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.getVideoUpdatedAt.queryOptions({
      input: { youtubeId },
    }),
    enabled: authenticated,
  });

  const computedState = useMemo((): SyncState => {
    if (authQuery.isFetching) return "checking";
    if (!authenticated) return "unauthenticated";
    if (serverQuery.isLoading) return "checking";
    if (serverQuery.isError) return "error";

    const localEntry = videoIndex.find((e) => e.youtubeId === youtubeId);
    return computeSyncState({
      localUpdatedAt: localEntry?.updatedAt,
      syncedAt: localEntry?.syncedAt,
      serverUpdatedAt: serverQuery.data?.updatedAt ?? undefined,
    });
  }, [
    youtubeId,
    authQuery.isFetching,
    authenticated,
    serverQuery.isLoading,
    serverQuery.isError,
    serverQuery.data,
    videoIndex,
    syncVersion,
  ]);

  const pushMutation = useMutation(
    orpc.videos.importVideo.mutationOptions({
      onSuccess: () => {
        setSyncedAt(youtubeId);
        setSyncVersion((v) => v + 1);
        serverQuery.refetch();
      },
    }),
  );

  const pullMutation = useMutation({
    mutationFn: async (store: CaptionSessionManager) => {
      const data = await queryClient.fetchQuery(
        orpc.videos.getFullSession.queryOptions({
          input: { youtubeId },
        }),
      );
      if (!data) return;
      await store.replace({
        captions: data.captions.map((c) => ({
          idx: c.idx,
          begin: c.begin,
          end: c.end,
          text1: c.text1,
          text2: c.text2,
          cue1Indices: [],
          cue2Indices: [],
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
      });
      setSyncedAt(youtubeId);
      setSyncVersion((v) => v + 1);
      serverQuery.refetch();
    },
  });

  const isSyncing = pushMutation.isPending || pullMutation.isPending;

  const onSync = (options: {
    direction?: SyncDirection;
    store: CaptionSessionManager;
  }) => {
    if (isSyncing) return;
    const action = options.direction ?? computedState;
    if (action === "push" || action === "conflict") {
      pushMutation.mutate(options.store.toExportData());
    } else if (action === "pull") {
      pullMutation.mutate(options.store);
    }
  };

  const state: SyncState = isSyncing ? "syncing" : computedState;
  const error = pushMutation.error ?? pullMutation.error ?? undefined;

  return { state, onSync, error };
}

export type VideoSyncEntry = {
  youtubeId: string;
  title: string;
  channelName: string;
  bookmarkCount: number;
  updatedAt: string;
  syncStatus?: "local-only" | "server-only" | "synced" | "pull" | "push";
};

export type VideoSyncHandle = ReturnType<typeof useVideoSync>;

export function useVideoSync() {
  const queryClient = useQueryClient();
  const [videoIndex] = useStore(videoIndexStore);

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.listVideos.queryOptions({ input: { limit: 200 } }),
    enabled: authenticated,
  });

  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  const withSyncing = async (youtubeId: string, fn: () => Promise<void>) => {
    setSyncing((s) => new Set(s).add(youtubeId));
    try {
      await fn();
    } finally {
      setSyncing((s) => {
        const next = new Set(s);
        next.delete(youtubeId);
        return next;
      });
    }
  };

  const pullMutation = useMutation({
    mutationFn: async (youtubeId: string) => {
      await withSyncing(youtubeId, async () => {
        const data = await queryClient.fetchQuery(
          orpc.videos.getFullSession.queryOptions({ input: { youtubeId } }),
        );
        if (!data) throw new Error("Video not found on server");
        await pullServerSession(data);
      });
    },
    onSuccess: () => {
      serverQuery.refetch();
    },
  });

  const pushMutation = useMutation(
    orpc.videos.importVideo.mutationOptions({
      onSuccess: () => {
        serverQuery.refetch();
      },
    }),
  );

  const onPush = async (youtubeId: string) => {
    await withSyncing(youtubeId, async () => {
      const session = await getSession(youtubeId);
      if (!session) throw new Error("No local session found");
      const indexEntry = videoIndex.find((e) => e.youtubeId === youtubeId);
      pushMutation.mutate({
        video: {
          youtubeId,
          title: indexEntry?.title ?? "",
          channelName: indexEntry?.channelName ?? "",
          channelId: "",
          duration: 0,
          language1: session.language1,
          language2: session.language2,
        },
        captions: session.captions.map((r, i) => ({
          idx: i,
          begin: r.begin,
          end: r.end,
          text1: r.text1,
          text2: r.text2,
        })),
        bookmarks: session.bookmarks.map((b) => ({
          text: b.text,
          translation: b.translation,
          etymology: b.etymology,
          notes: b.notes,
          captionIdx: b.captionIndex,
          side: b.side,
          offset: b.offset,
          context: b.context,
          status: "manual",
        })),
      });
      setSyncedAt(youtubeId);
    });
  };

  const entries = useMemo((): VideoSyncEntry[] => {
    if (!authenticated) {
      return videoIndex.map((e) => ({
        youtubeId: e.youtubeId,
        title: e.title,
        channelName: e.channelName,
        bookmarkCount: e.bookmarkCount,
        updatedAt: e.updatedAt,
      }));
    }

    const serverVideos = serverQuery.data?.items ?? [];
    const merged = new Map<string, VideoSyncEntry>();

    for (const local of videoIndex) {
      const server = serverVideos.find((v) => v.youtubeId === local.youtubeId);
      const status = computeSyncState({
        localUpdatedAt: local.updatedAt,
        syncedAt: local.syncedAt,
        serverUpdatedAt: server?.updatedAt ?? undefined,
      });
      merged.set(local.youtubeId, {
        youtubeId: local.youtubeId,
        title: local.title,
        channelName: local.channelName,
        bookmarkCount: local.bookmarkCount,
        updatedAt: local.updatedAt,
        syncStatus:
          status === "synced" || status === "push" || status === "pull"
            ? status
            : status === "conflict"
              ? "push"
              : "local-only",
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
          syncStatus: "server-only",
        });
      }
    }

    return Array.from(merged.values());
  }, [authenticated, videoIndex, serverQuery.data]);

  return {
    entries,
    syncing,
    onPull: (youtubeId: string) => pullMutation.mutate(youtubeId),
    onPush,
  };
}

async function pullServerSession(
  data: NonNullable<
    Awaited<
      ReturnType<
        ReturnType<typeof orpc.videos.getFullSession.queryOptions>["queryFn"]
      >
    >
  >,
): Promise<void> {
  const captions = data.captions.map((c) => ({
    idx: c.idx,
    begin: c.begin,
    end: c.end,
    text1: c.text1,
    text2: c.text2,
    cue1Indices: [] as number[],
    cue2Indices: [] as number[],
    text1Segments: [c.text1],
    text2Segments: [c.text2],
  }));
  const bookmarks = data.bookmarks.map((b) => ({
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
  }));
  await saveSession({
    youtubeId: data.video.youtubeId,
    vssId1: `-.${data.video.language1}`,
    vssId2: `-.${data.video.language2}`,
    language1: data.video.language1,
    language2: data.video.language2,
    captions,
    bookmarks,
  });
  updateVideoIndex(
    data.video.youtubeId,
    data.video.title,
    data.video.channelName,
    bookmarks.length,
  );
  setSyncedAt(data.video.youtubeId);
}
