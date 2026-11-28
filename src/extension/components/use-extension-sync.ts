import { useMutation, useQuery } from "@tanstack/react-query";
import { useVideoIndexEntry } from "../../components/use-video-index-entry.ts";
import type { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
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
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const serverQuery = useQuery({
    queryKey: ["extension-sync-state", youtubeId],
    queryFn: () => bgRpc.getSyncState({ youtubeId }),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: SyncAction) => {
      if (action.direction === "push") {
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
    },
    onSuccess: () => serverQuery.refetch(),
  });

  const getState = (): SyncState => {
    if (syncMutation.isPending) {
      return "syncing";
    }
    if (serverQuery.isPending) {
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
    onPush: () => syncMutation.mutate({ direction: "push" }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
