import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { orpc } from "../rpc.ts";
import type { Router } from "../server/rpc.ts";
import type { MergedCaption } from "./caption-merge.ts";
import { saveSession } from "./caption-session-db.ts";
import type { CaptionSessionManager } from "./caption-session.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
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

function computeSyncState(params: {
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

type GetFullSessionResult = NonNullable<
  InferRouterOutputs<Router>["videos"]["getFullSession"]
>;

function serverSessionToLocal(data: GetFullSessionResult): {
  captions: MergedCaption[];
  bookmarks: ExtensionBookmark[];
} {
  const captions: MergedCaption[] = data.captions.map((c) => ({
    idx: c.idx,
    begin: c.begin,
    end: c.end,
    text1: c.text1,
    text2: c.text2,
    cue1Indices: [],
    cue2Indices: [],
    text1Segments: [c.text1],
    text2Segments: [c.text2],
  }));
  const bookmarks: ExtensionBookmark[] = data.bookmarks.map((b) => ({
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
  return { captions, bookmarks };
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
      const { captions, bookmarks } = serverSessionToLocal(data);
      await saveSession({
        youtubeId,
        vssId1: store.vssId1,
        vssId2: store.vssId2,
        language1: data.video.language1,
        language2: data.video.language2,
        captions,
        bookmarks,
      });
      updateVideoIndex(
        youtubeId,
        data.video.title,
        data.video.channelName,
        bookmarks.length,
      );
      setSyncedAt(youtubeId);
      setSyncVersion((v) => v + 1);
      store.rehydrate();
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
