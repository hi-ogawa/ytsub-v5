import { useMutation, useQuery } from "@tanstack/react-query";
import type { CaptionSessionManager } from "../../lib/caption-session.ts";
import { captionStorage } from "../../lib/caption-storage.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
  useVideoIndexEntry,
} from "../../lib/sync.ts";
import type { bgRpcHandlers } from "../background.ts";
import { createRuntimeRelayRpc } from "./extension-rpc.ts";

const bgRpc = createRuntimeRelayRpc<typeof bgRpcHandlers>();

type SyncAction =
  | { direction: "push" }
  | { direction: "pull"; store: CaptionSessionManager };

export function useExtensionSync(youtubeId: string): SyncStatus {
  const entryQuery = useVideoIndexEntry(youtubeId);

  const serverQuery = useQuery({
    queryKey: ["extension-sync-state", youtubeId],
    queryFn: () => bgRpc.getSyncState({ youtubeId }),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: SyncAction) => {
      if (action.direction === "push") {
        const { serverUpdatedAt } = await bgRpc.pushSession({ youtubeId });
        await captionStorage.setSyncedAt(youtubeId, serverUpdatedAt);
      } else {
        const { session, serverUpdatedAt } = await bgRpc.fetchSession({
          youtubeId,
        });
        // replace() bumps the index entry's updatedAt, so setSyncedAt must follow it.
        await action.store.replace({
          vssId1: session.vssId1,
          vssId2: session.vssId2,
          captions: session.captions,
          bookmarks: session.bookmarks,
        });
        await captionStorage.setSyncedAt(youtubeId, serverUpdatedAt);
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
      localUpdatedAt: localEntry?.updatedAt,
      syncedAt: localEntry?.syncedAt,
      syncedServerUpdatedAt: localEntry?.syncedServerUpdatedAt,
      serverUpdatedAt: serverQuery.data.serverUpdatedAt,
    });
  };

  const { error, variables } = syncMutation;

  return {
    state: getState(),
    error: error
      ? `${variables?.direction === "pull" ? "Download" : "Upload"} failed: ${error.message}`
      : undefined,
    onNavigate: () => bgRpc.openBookmarks(),
    onPush: () => syncMutation.mutate({ direction: "push" }),
    onPull: (store) => syncMutation.mutate({ direction: "pull", store }),
  };
}
