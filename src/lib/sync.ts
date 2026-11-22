import type { CaptionPanelRuntime } from "./caption-panel-runtime.ts";

export type SyncState =
  | "unauthenticated"
  | "checking"
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "syncing"
  | "error"
  | "empty";

export type ComputedSyncState =
  | "synced"
  | "push"
  | "pull"
  | "conflict"
  | "empty";

export function computeSyncState(params: {
  localUpdatedAt?: string;
  syncedAt?: string;
  syncedServerUpdatedAt?: string;
  serverUpdatedAt?: string;
}): ComputedSyncState {
  const { localUpdatedAt, syncedAt, syncedServerUpdatedAt, serverUpdatedAt } =
    params;

  // No local entry
  if (!localUpdatedAt) {
    return serverUpdatedAt ? "pull" : "empty";
  }

  // syncedAt without localUpdatedAt is structurally impossible (syncedAt lives on VideoIndexEntry)
  // but handled above. syncedAt without serverUpdatedAt is degenerate (server data deleted).

  if (!syncedAt) {
    if (!serverUpdatedAt) {
      return "push";
    }
    return "conflict";
  }

  // Server data gone after a previous sync — need to re-push
  if (!serverUpdatedAt) {
    return "push";
  }

  // Each comparison stays within one clock, because the client and server
  // clocks can disagree. Entries synced before syncedServerUpdatedAt existed
  // fall back to the local syncedAt.
  const localChanged = localUpdatedAt > syncedAt;
  const serverChanged = serverUpdatedAt > (syncedServerUpdatedAt ?? syncedAt);

  if (!localChanged && !serverChanged) {
    return "synced";
  }
  if (localChanged && !serverChanged) {
    return "push";
  }
  if (!localChanged && serverChanged) {
    return "pull";
  }
  return "conflict";
}

export type SyncStatus = {
  state: SyncState;
  error?: string;
  onNavigate: () => void;
  onPush: (runtime: CaptionPanelRuntime) => void;
  onPull: (runtime: CaptionPanelRuntime) => void;
};

export type UseSync = (options: { youtubeId: string }) => SyncStatus;
