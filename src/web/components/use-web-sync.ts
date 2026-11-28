import { useSyncStatus } from "../../components/use-sync-status.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
import {
  checkServerSyncState,
  fetchServerSession,
} from "../../lib/sync-server.ts";
import type { SyncStatus } from "../../lib/sync.ts";

/** Per-video sync for the web viewer's caption panel, which calls the server directly. */
export function useWebSync({
  storage,
  youtubeId,
  onNavigate,
}: {
  storage: CaptionStorage;
  youtubeId: string;
  onNavigate: () => void;
}): SyncStatus {
  return useSyncStatus({
    storage,
    youtubeId,
    transport: {
      checkServer: () => checkServerSyncState(youtubeId),
      push: async (runtime) => {
        const entry = await storage.getVideoIndexEntry(youtubeId);
        if (!entry) {
          throw new Error("No local index entry found");
        }
        return orpc.videos.importVideo.call(
          runtime.toExportData({ editedAt: entry.editedAt }),
        );
      },
      fetchSession: () => fetchServerSession(youtubeId),
      openBookmarks: onNavigate,
    },
  });
}
