import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { orpc } from "../rpc.ts";
import type { MergedCaption } from "./caption-merge.ts";
import { saveSession } from "./caption-session-db.ts";
import type { CaptionSessionManager } from "./caption-session.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import {
  getVideoIndexEntry,
  setSyncedAt,
  updateVideoIndex,
  videoIndexStore,
} from "./video-index.ts";

export type SyncState =
  | "checking"
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "syncing"
  | "error";

export function useSyncState({ youtubeId }: { youtubeId: string }) {
  const queryClient = useQueryClient();
  const [syncVersion, setSyncVersion] = useState(0);

  // Re-run sync state when video index changes (e.g. bookmark created)
  const videoIndex = useSyncExternalStore(
    videoIndexStore.subscribe,
    videoIndexStore.get,
  );

  const serverQuery = useQuery(
    orpc.videos.getVideoUpdatedAt.queryOptions({
      input: { youtubeId },
    }),
  );

  const computedState = useMemo((): SyncState => {
    if (serverQuery.isLoading) return "checking";
    if (serverQuery.isError) return "error";

    const localEntry = getVideoIndexEntry(youtubeId);
    const syncedAt = localEntry?.syncedAt;
    const localUpdatedAt = localEntry?.updatedAt;
    const serverUpdatedAt = serverQuery.data?.updatedAt ?? null;

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
  }, [
    youtubeId,
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
        queryClient.invalidateQueries({
          queryKey: orpc.videos.getVideoUpdatedAt.queryOptions({
            input: { youtubeId },
          }).queryKey,
        });
      },
    }),
  );

  const pullMutation = useMutation({
    mutationFn: async (store: CaptionSessionManager) => {
      const result = await queryClient.fetchQuery(
        orpc.videos.getFullSession.queryOptions({
          input: { youtubeId },
        }),
      );
      return { result, store };
    },
    onSuccess: async ({ result: data, store }) => {
      if (!data) return;
      const mergedCaptions: MergedCaption[] = data.captions.map((c) => ({
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
      const pulledBookmarks: ExtensionBookmark[] = data.bookmarks.map(
        (b, i) => ({
          id: `pulled-${i}-${Date.now()}`,
          text: b.text,
          side: b.side,
          offset: b.offset,
          captionIndex: b.captionIdx,
          timestamp: b.timestamp,
          context: b.context,
          translation: b.translation,
          etymology: b.etymology,
          notes: b.notes,
          createdAt: new Date().toISOString(),
        }),
      );
      await saveSession({
        youtubeId,
        vssId1: store.vssId1,
        vssId2: store.vssId2,
        language1: data.video.language1,
        language2: data.video.language2,
        captions: mergedCaptions,
        bookmarks: pulledBookmarks,
      });
      updateVideoIndex(
        youtubeId,
        data.video.title,
        data.video.channelName,
        pulledBookmarks.length,
      );
      setSyncedAt(youtubeId);
      setSyncVersion((v) => v + 1);
      // Rehydrate store from IndexedDB
      store.rehydrate();
      queryClient.invalidateQueries({
        queryKey: orpc.videos.getVideoUpdatedAt.queryOptions({
          input: { youtubeId },
        }).queryKey,
      });
    },
  });

  const isSyncing = pushMutation.isPending || pullMutation.isPending;

  const sync = useCallback(
    (direction: "push" | "pull" | undefined, store: CaptionSessionManager) => {
      if (isSyncing) return;
      const action = direction ?? computedState;
      if (action === "push" || action === "conflict") {
        pushMutation.mutate(store.toExportData());
      } else if (action === "pull") {
        pullMutation.mutate(store);
      }
    },
    [isSyncing, computedState, pushMutation, pullMutation],
  );

  const state: SyncState = isSyncing ? "syncing" : computedState;
  const error = pushMutation.error ?? pullMutation.error ?? null;

  return { state, onSync: sync, error };
}
