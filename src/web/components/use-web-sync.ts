import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoIndexEntry } from "../../components/use-video-index-entry.ts";
import type { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import { serverSessionToLocal } from "../../lib/caption-session.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
import {
  type SyncState,
  type SyncStatus,
  SYNC_CHECK_STALE_TIME,
  computeSyncState,
  canPushWithoutOverwriting,
} from "../../lib/sync.ts";

/**
 * Per-video sync for the web viewer's caption panel, which calls the server
 * directly. `useExtensionSync` is the extension's counterpart.
 */
export function useWebSync({
  storage,
  youtubeId,
  onNavigate,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  onNavigate: () => void;
}): SyncStatus {
  const queryClient = useQueryClient();
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.getVideoEditedAt.queryOptions({
      input: { youtubeId },
    }),
    enabled: authenticated,
    staleTime: SYNC_CHECK_STALE_TIME,
  });

  // Tracks only checks the user clicks for, so they show the spinner.
  // `isRefetching` would also cover focus refetches, which keep the last
  // state on screen instead.
  const checkMutation = useMutation({
    mutationFn: () => serverQuery.refetch(),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: {
      direction: "push" | "pull";
      runtime: CaptionPanelRuntime;
    }) => {
      if (action.direction === "push") {
        const server = await orpc.videos.getVideoEditedAt.call({ youtubeId });
        queryClient.setQueryData(
          orpc.videos.getVideoEditedAt.queryKey({ input: { youtubeId } }),
          server,
        );
        const localEntry = await storage.getVideoIndexEntry(youtubeId);
        if (
          !canPushWithoutOverwriting({
            localEditedAt: localEntry?.editedAt,
            syncedEditedAt: localEntry?.syncedEditedAt,
            serverEditedAt: server?.editedAt,
          })
        ) {
          return false;
        }
        await storage.ensureVideoIndexEntry(youtubeId);
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
        await action.runtime.replace(
          {
            vssId1: session.vssId1,
            vssId2: session.vssId2,
            captions: session.captions,
            bookmarks: session.bookmarks,
          },
          { syncedEditedAt: data.video.editedAt },
        );
      }
      return true;
    },
    onSuccess: (ran) => {
      if (ran) {
        serverQuery.refetch();
      }
    },
  });

  const getState = (): SyncState => {
    if (syncMutation.isPending) {
      return "syncing";
    }
    if (authQuery.isPending) {
      return "checking";
    }
    if (!authenticated) {
      return "unauthenticated";
    }
    if (serverQuery.isLoading || checkMutation.isPending) {
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
    onCheck: () => checkMutation.mutate(),
    onNavigate,
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
