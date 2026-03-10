import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { orpc } from "../rpc.ts";
import type { MergedCaption } from "./caption-merge.ts";
import { saveSession } from "./caption-session-db.ts";
import type { CaptionSessionManager } from "./caption-session.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import {
  getVideoIndexEntry,
  setSyncedAt,
  updateVideoIndex,
} from "./video-index.ts";

export type SyncState =
  | "checking"
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "syncing"
  | "error";

interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
}

function buildExportPayload(
  videoMeta: VideoMeta,
  rows: MergedCaption[],
  bookmarks: ExtensionBookmark[],
  language1: string,
  language2: string,
) {
  return {
    video: {
      youtubeId: videoMeta.youtubeId,
      title: videoMeta.title,
      channelName: videoMeta.channelName ?? "",
      channelId: videoMeta.channelId ?? "",
      duration: videoMeta.duration ?? 0,
      language1,
      language2,
    },
    captions: rows.map((r, i) => ({
      idx: i,
      begin: r.begin,
      end: r.end,
      text1: r.text1,
      text2: r.text2,
    })),
    bookmarks: bookmarks.map((b) => ({
      text: b.text,
      translation: b.translation,
      etymology: b.etymology,
      notes: b.notes,
      captionIdx: b.captionIndex,
      side: b.side,
      offset: b.offset,
      context: b.context,
      status: "manual" as const,
    })),
  };
}

export function useSyncState({
  youtubeId,
  session,
  videoMeta,
  language1,
  language2,
}: {
  youtubeId: string;
  session: CaptionSessionManager;
  videoMeta: VideoMeta;
  language1: string;
  language2: string;
}) {
  const queryClient = useQueryClient();
  // Bump to force recomputation of sync state after sync completes
  const [syncVersion, setSyncVersion] = useState(0);

  // Fetch server's updatedAt for this video
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

    // Never synced, no local data, no server data
    if (!localUpdatedAt && !serverUpdatedAt) return "synced";

    // Never synced but has local data → push
    if (!syncedAt) {
      if (localUpdatedAt && !serverUpdatedAt) return "push";
      if (!localUpdatedAt && serverUpdatedAt) return "pull";
      // Both exist but never synced → conflict
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
    session.bookmarks,
    syncVersion,
  ]);

  // Push mutation
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

  // Pull mutation
  const pullMutation = useMutation({
    mutationFn: async () => {
      const result = await queryClient.fetchQuery(
        orpc.videos.getFullSession.queryOptions({
          input: { youtubeId },
        }),
      );
      return result;
    },
    onSuccess: async (data) => {
      if (!data) return;
      // Overwrite local IndexedDB session with server data
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
        vssId1: session.selectedVssId1 ?? "",
        vssId2: session.selectedVssId2 ?? "",
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
      // Rehydrate React state from IndexedDB
      session.rehydrate();
      queryClient.invalidateQueries({
        queryKey: orpc.videos.getVideoUpdatedAt.queryOptions({
          input: { youtubeId },
        }).queryKey,
      });
    },
  });

  const isSyncing = pushMutation.isPending || pullMutation.isPending;

  const sync = useCallback(
    (direction?: "push" | "pull") => {
      if (isSyncing || !session.rows) return;
      const action = direction ?? computedState;
      if (action === "push" || action === "conflict") {
        pushMutation.mutate(
          buildExportPayload(
            videoMeta,
            session.rows,
            session.bookmarks,
            language1,
            language2,
          ),
        );
      } else if (action === "pull") {
        pullMutation.mutate();
      }
    },
    [
      isSyncing,
      computedState,
      session.rows,
      session.bookmarks,
      videoMeta,
      language1,
      language2,
      pushMutation,
      pullMutation,
    ],
  );

  const state: SyncState = isSyncing ? "syncing" : computedState;
  const error = pushMutation.error ?? pullMutation.error ?? null;

  return { state, onSync: sync, error };
}
