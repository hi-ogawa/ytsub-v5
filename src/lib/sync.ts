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

/**
 * Each side's edit time changes with every edit and is copied unchanged by
 * push and pull, so comparing it for equality with its value at the last sync
 * tells whether that side changed, whatever the clocks say.
 */
export function computeSyncState(params: {
  localEditedAt?: string;
  syncedEditedAt?: string;
  serverEditedAt?: string;
}): ComputedSyncState {
  const { localEditedAt, syncedEditedAt, serverEditedAt } = params;

  // No local entry
  if (!localEditedAt) {
    return serverEditedAt ? "pull" : "empty";
  }

  if (!syncedEditedAt) {
    return serverEditedAt ? "conflict" : "push";
  }

  // Server data gone after a previous sync — need to re-push
  if (!serverEditedAt) {
    return "push";
  }

  const localChanged = localEditedAt !== syncedEditedAt;
  const serverChanged = serverEditedAt !== syncedEditedAt;

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

/**
 * How long a server check counts as fresh, so regaining focus re-checks only
 * after this. Each check is a D1 read, so the status never polls.
 */
export const SYNC_CHECK_STALE_TIME = 60_000;

/**
 * Whether a push clicked from a possibly stale status still matches the
 * status recomputed from a fresh server check. Push replaces the server copy
 * wholesale, so pushing from a stale status would drop edits made on another
 * device since the last check. Pull needs no such check, because local edits
 * recompute the status at once.
 */
export function isPushCurrent(params: {
  localEditedAt?: string;
  syncedEditedAt?: string;
  serverEditedAt?: string;
}): boolean {
  const state = computeSyncState(params);
  return state === "push" || state === "empty";
}

export type SyncStatus = {
  state: SyncState;
  error?: string;
  onCheck: () => void;
  onNavigate: () => void;
  onPush: (runtime: CaptionPanelRuntime) => void;
  onPull: (runtime: CaptionPanelRuntime) => void;
};

export type UseSync = (options: { youtubeId: string }) => SyncStatus;
