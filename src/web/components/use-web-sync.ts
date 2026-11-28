import { useSyncStatus } from "../../components/use-sync-status.ts";
import { serverSessionToLocal } from "../../lib/caption-session.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
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
      checkServer: async () => {
        const { authenticated } = await orpc.auth.check.call({});
        if (!authenticated) {
          return { authenticated };
        }
        const data = await orpc.videos.getVideoEditedAt.call({ youtubeId });
        return { authenticated, serverEditedAt: data?.editedAt };
      },
      push: async (runtime) => {
        const entry = await storage.getVideoIndexEntry(youtubeId);
        if (!entry) {
          throw new Error("No local index entry found");
        }
        return orpc.videos.importVideo.call(
          runtime.toExportData({ editedAt: entry.editedAt }),
        );
      },
      fetchSession: async () => {
        const data = await orpc.videos.getFullSession.call({ youtubeId });
        if (!data) {
          throw new Error("Video not found on server");
        }
        return {
          session: serverSessionToLocal(data),
          editedAt: data.video.editedAt,
        };
      },
      onNavigate,
    },
  });
}
