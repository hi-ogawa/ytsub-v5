import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../lib/caption-storage.ts";
import {
  type SyncState,
  type SyncStatus,
  type SyncTransport,
  canPushWithoutOverwriting,
  computeSyncState,
} from "../lib/sync.ts";
import { useVideoIndexEntry } from "./use-video-index-entry.ts";

/**
 * Per-video sync for the caption panel, the same in every client apart from
 * how it reaches the server.
 */
export function useSyncStatus({
  storage,
  youtubeId,
  transport,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  transport: SyncTransport;
}): SyncStatus {
  const queryClient = useQueryClient();
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const serverQueryKey = ["sync-server-state", youtubeId];
  const serverQuery = useQuery({
    queryKey: serverQueryKey,
    queryFn: transport.checkServer,
    // Set here because the extension's query client turns it off by default.
    refetchOnWindowFocus: true,
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
        const latestServerState = await transport.checkServer();
        queryClient.setQueryData(serverQueryKey, latestServerState);
        const localEntry = await storage.getVideoIndexEntry(youtubeId);
        if (
          !latestServerState.authenticated ||
          !canPushWithoutOverwriting({
            localEditedAt: localEntry?.editedAt,
            syncedEditedAt: localEntry?.syncedEditedAt,
            serverEditedAt: latestServerState.serverEditedAt,
          })
        ) {
          return false;
        }
        await storage.ensureVideoIndexEntry(youtubeId);
        const { editedAt } = await transport.push(action.runtime);
        await storage.markSynced({ youtubeId, editedAt });
      } else {
        const { session, editedAt } = await transport.fetchSession();
        await action.runtime.replace(
          {
            vssId1: session.vssId1,
            vssId2: session.vssId2,
            captions: session.captions,
            bookmarks: session.bookmarks,
          },
          { syncedEditedAt: editedAt },
        );
      }
      return true;
    },
    onSuccess: (didSync) => {
      if (didSync) {
        serverQuery.refetch();
      }
    },
  });

  const getState = (): SyncState => {
    if (syncMutation.isPending) {
      return "syncing";
    }
    if (serverQuery.isPending || checkMutation.isPending) {
      return "checking";
    }
    if (serverQuery.isError) {
      return "error";
    }
    if (!serverQuery.data.authenticated) {
      return "unauthenticated";
    }
    if (entryQuery.isPending) {
      return "checking";
    }
    const localEntry = entryQuery.data ?? undefined;
    return computeSyncState({
      localEditedAt: localEntry?.editedAt,
      syncedEditedAt: localEntry?.syncedEditedAt,
      serverEditedAt: serverQuery.data.serverEditedAt,
    });
  };

  const { error, variables } = syncMutation;

  return {
    state: getState(),
    error: error
      ? `${variables?.direction === "pull" ? "Download" : "Upload"} failed: ${error.message}`
      : undefined,
    onCheck: () => checkMutation.mutate(),
    onNavigate: transport.openBookmarks,
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
