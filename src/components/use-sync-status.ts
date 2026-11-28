import { useMutation, useQuery } from "@tanstack/react-query";
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
  onNavigate: () => void;
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
  const entryQuery = useVideoIndexEntry({ storage, youtubeId });

  const serverQuery = useQuery({
    queryKey: ["sync-server-state", youtubeId],
    queryFn: () => transport.checkServer(),
  });

  const syncMutation = useMutation({
    mutationFn: async (action: {
      direction: "push" | "pull";
      runtime: CaptionPanelRuntime;
    }) => {
      if (action.direction === "push") {
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
    onNavigate: transport.onNavigate,
    onPush: (runtime) => syncMutation.mutate({ direction: "push", runtime }),
    onPull: (runtime) => syncMutation.mutate({ direction: "pull", runtime }),
  };
}
