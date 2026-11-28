import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
} from "../lib/caption-storage.ts";
import {
  type SyncState,
  type SyncStatus,
  computeSyncState,
} from "../lib/sync.ts";
import { useVideoIndexEntry } from "./use-video-index-entry.ts";

/**
 * How a client reaches the server for one video's sync. The extension goes
 * through its background and the web app calls the server directly, and
 * everything else about sync is the same.
 */
export type SyncTransport = {
  checkServer: () => Promise<{
    authenticated: boolean;
    serverEditedAt?: string;
  }>;
  push: (runtime: CaptionPanelRuntime) => Promise<{ editedAt: string }>;
  fetchSession: () => Promise<{
    session: PersistedCaptionSession;
    editedAt: string;
  }>;
};

/** Per-video sync for the caption panel, over a client's transport. */
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
    queryFn: () => transport.checkServer(),
    // The extension's content script turns focus refetching off by default.
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
        // Push replaces the server copy wholesale, so a push clicked from a
        // stale status would drop edits made on another device since the last
        // check. Pull needs no such check, because local edits recompute the
        // status at once.
        const latestSyncState = await transport.checkServer();
        queryClient.setQueryData(serverQueryKey, latestSyncState);
        if (!latestSyncState.authenticated) {
          return false;
        }
        const localEntry = await storage.getVideoIndexEntry(youtubeId);
        const latestState = computeSyncState({
          localEditedAt: localEntry?.editedAt,
          syncedEditedAt: localEntry?.syncedEditedAt,
          serverEditedAt: latestSyncState.serverEditedAt,
        });
        if (latestState !== "push" && latestState !== "empty") {
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
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
