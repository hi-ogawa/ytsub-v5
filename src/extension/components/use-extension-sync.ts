import { useSyncStatus } from "../../components/use-sync-status.ts";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import type { SyncStatus } from "../../lib/sync.ts";
import type { bgRpcHandlers } from "../background.ts";
import type { RpcClient } from "../lib/extension-rpc.ts";

/**
 * Per-video sync for the caption panel on YouTube. The content script never
 * holds the session token, so it reaches the server through the background
 * (docs/extension-runtime.md).
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
  return useSyncStatus({
    storage,
    youtubeId,
    transport: {
      checkServer: () => bgRpc.getSyncState({ youtubeId }),
      // The background reads the session from the database itself.
      push: () => bgRpc.pushSession({ youtubeId }),
      fetchSession: () => bgRpc.fetchSession({ youtubeId }),
      onNavigate: () => bgRpc.openBookmarks(),
    },
  });
}
