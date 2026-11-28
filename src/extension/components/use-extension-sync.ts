import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoIndexEntry } from "../../components/use-video-index-entry.ts";
import type { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
  canPushWithoutOverwriting,
} from "../../lib/sync.ts";
import type { bgRpcHandlers } from "../background.ts";
import type { RpcClient } from "../lib/extension-rpc.ts";

type SyncAction =
  | { direction: "push" }
  | { direction: "pull"; runtime: CaptionPanelRuntime };

/**
 * Per-video sync for the caption panel on YouTube. The content script never
 * holds the session token, so it reaches the server through the background
 * (docs/extension-runtime.md). `useWebSync` is the web viewer's counterpart.
 */
export function useExtensionSync({
  storage,
  bgRpc,
  youtubeId,
}: {
  storage: CaptionStorage;
  bgRpc: RpcClient<typeof bgRpcHandlers>;
  youtubeId: string;
}): SyncStatus {
  const queryClient = useQueryClient();
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const serverQueryKey = ["extension-sync-state", youtubeId];
  const serverQuery = useQuery({
    queryKey: serverQueryKey,
    queryFn: () => bgRpc.getSyncState({ youtubeId }),
    // The content script's query client turns focus refetching off.
    refetchOnWindowFocus: true,
  });

  // Tracks only checks the user clicks for, so they show the spinner.
  // `isRefetching` would also cover focus refetches, which keep the last
  // state on screen instead.
  const checkMutation = useMutation({
    mutationFn: () => serverQuery.refetch(),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: SyncAction) => {
      if (action.direction === "push") {
        const server = await bgRpc.getSyncState({ youtubeId });
        queryClient.setQueryData(serverQueryKey, server);
        const localEntry = await storage.getVideoIndexEntry(youtubeId);
        if (
          !server.authenticated ||
          !canPushWithoutOverwriting({
            localEditedAt: localEntry?.editedAt,
            syncedEditedAt: localEntry?.syncedEditedAt,
            serverEditedAt: server.serverEditedAt,
          })
        ) {
          return false;
        }
        await storage.ensureVideoIndexEntry(youtubeId);
        const { editedAt } = await bgRpc.pushSession({ youtubeId });
        await storage.markSynced({ youtubeId, editedAt });
      } else {
        const { session, editedAt } = await bgRpc.fetchSession({ youtubeId });
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
    onNavigate: () => bgRpc.openBookmarks(),
    onPush: () => syncMutation.mutate({ direction: "push" }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
