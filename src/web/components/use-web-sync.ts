import { useMutation, useQuery } from "@tanstack/react-query";
import { useVideoIndexEntry } from "../../components/use-video-index-entry.ts";
import type { CaptionPanelRuntime } from "../../lib/caption-panel-runtime.ts";
import { serverSessionToLocal } from "../../lib/caption-session.ts";
import {
  type CaptionStorage,
  isVideoListed,
} from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
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
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;

  const serverQuery = useQuery({
    ...orpc.videos.getVideoEditedAt.queryOptions({
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
    const localEntry =
      entryQuery.data && isVideoListed(entryQuery.data)
        ? entryQuery.data
        : undefined;
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
    onNavigate,
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
