import { useMutation, useQuery } from "@tanstack/react-query";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import { serverSessionToLocal } from "../lib/caption-session.ts";
import type { CaptionStorage } from "../lib/caption-storage.ts";
import { orpc } from "../lib/rpc-client.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
} from "../lib/sync.ts";
import { useVideoIndexEntry } from "../lib/use-video-index-entry.ts";

export function useWebSync({
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
    ...orpc.videos.getVideoUpdatedAt.queryOptions({
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
        const result = await orpc.videos.importVideo.call(
          action.runtime.toExportData(),
        );
        await storage.markSynced({
          youtubeId,
          serverUpdatedAt: result.updatedAt,
        });
      } else {
        const data = await orpc.videos.getFullSession.call({ youtubeId });
        if (!data) {
          throw new Error("Video not found on server");
        }
        const session = serverSessionToLocal(data);
        // replace() bumps the index entry's updatedAt, so markSynced must follow it.
        await action.runtime.replace({
          vssId1: session.vssId1,
          vssId2: session.vssId2,
          captions: session.captions,
          bookmarks: session.bookmarks,
        });
        await storage.markSynced({
          youtubeId,
          serverUpdatedAt: data.video.updatedAt,
        });
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
      localUpdatedAt: localEntry?.updatedAt,
      syncedAt: localEntry?.syncedAt,
      syncedServerUpdatedAt: localEntry?.syncedServerUpdatedAt,
      serverUpdatedAt: serverQuery.data?.updatedAt ?? undefined,
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
